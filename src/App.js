import React, { useRef } from "react";
import { Chess } from "chess.js";
import Chessboard from "chessboardjsx";
import { SSE } from "sse.js";

function Board({ onMoveFn = (game) => { }}) {
  const [fen, setFen] = React.useState("start");
  const [dropSquareStyle, setDropSquareStyle] = React.useState({});
  const [squareStyles, setSquareStyles] = React.useState({});

  const game = React.useRef(new Chess());

  const squareStyling = (history) => {
    const sourceSquare = history.length && history[history.length - 1].from;
    const targetSquare = history.length && history[history.length - 1].to;

    return {
      ...(history.length && {
        [sourceSquare]: {
          backgroundColor: "rgba(255, 255, 0, 0.4)"
        }
      }),
      ...(history.length && {
        [targetSquare]: {
          backgroundColor: "rgba(255, 255, 0, 0.4)"
        }
      })
    };
  };

  const onDrop = ({ sourceSquare, targetSquare }) => {
    try {
      game.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q" // warn: always promote to a queen
      });
    } catch (error) {
      return;
    }

    setFen(game.current.fen());
    setSquareStyles(squareStyling(game.current.history({ verbose: true })))
    onMoveFn(game.current);
  };

  const onDragOverSquare = _ => {
    setDropSquareStyle({ boxShadow: "inset 0 0 1px 2px rgb(255, 255, 0)" })
  };

  return (
    <Chessboard
      id="board"
      width={300}
      position={fen}
      onDrop={onDrop}
      boardStyle={{}}
      squareStyles={squareStyles}
      dropSquareStyle={dropSquareStyle}
      onDragOverSquare={onDragOverSquare}
    />
  )
}

// TODO: give it engine evaluation and moves
//
// Consider more structure on expected outputs. e.g. plans, threats, alternatives
// e.g.
// Answer the following questions with each answer on a new line
// * Is there theory for the last move? If so, what is it?
// * What is the idea behind the last move?
// * What are the key threats to consider given the last move? Answer very concisely
// * What is the best idea for our next move?
const sysPrompt = `
Explain the idea behind the most last move in a given chess game.

Do not explain the previous moves in the game; focus only on this current move.
Do not redundantly reiterate just what the move was; instead immediately explain the idea behind it. Get to the point. Do not waste words like "The last move was the knight move e4"; Instead just explain "e4 attacks the queen and ..."
Explain concisely in no more than 5 sentences.
Explain briefly the key idea behind the move and if this is a good move.
Explain at a 1800 ELO level.
`.trim();

// FEN v. PGN?
function humPrompt(game) {
  const lastTurn = game.turn() === "w" ? "Black" : "White"; // note this is flipped
  const pgn = game.pgn();
  const fen = game.fen();
  const history = game.history();
  return `
Last Move:
${lastTurn} played ${history[history.length - 1]}

PGN:
${pgn}

Board:
${fen}
`.trim();
}

const gptModel = "gpt-4";
const gptTemperature = 0.7;

export default function App() {
  const [explanation, setExplanation] = React.useState("");
  const resultRef = useRef("");
  const sourceRef = useRef(null);

  const onMoveFn = async (game) => {
    resultRef.current = "";
    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      setExplanation("WARN: REACT_APP_OPENAI_API_KEY required");
      return;
    }

    let url = "https://api.openai.com/v1/chat/completions";
    let data = {
      model: gptModel,
      temperature: gptTemperature,
      messages: [
        {
          "role": "system",
          "content": sysPrompt
        },
        {
          "role": "user",
          "content": humPrompt(game)
        }
      ],
      stream: true,
    };

    // kill current stream if it exists
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    sourceRef.current = new SSE(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
      },
      method: "POST",
      payload: JSON.stringify(data),
    });

    sourceRef.current.addEventListener("message", (e) => {
      if (e.data !== "[DONE]") {
        let payload = JSON.parse(e.data);
        let text = payload.choices[0].delta.content;
        if (text) {
          resultRef.current = resultRef.current + text;
          setExplanation(resultRef.current);
        }
      } else {
        sourceRef.current.close();
      }
    });

    sourceRef.current.stream();
  };

  return (
    <div className="h-screen flex justify-center items-center">
      <div className="flex items-start">
        <Board onMoveFn={onMoveFn}/>
        <div className="px-8 w-[600px] max-h-[600px] overflow-auto">
          { explanation
            ? <div>
                <div className="font-bold">{gptModel} says</div>
                <div>{explanation}</div>
              </div>
            : "Make a move."
          }
        </div>
      </div>
    </div>
  )
}
