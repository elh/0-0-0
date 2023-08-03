import React, { useEffect, useRef } from "react";
import { Chess } from "chess.js";
import Chessboard from "chessboardjsx";
import { SSE } from "sse.js";

function Board({ fen, lastMove, onDropFn = ({ sourceSquare, targetSquare }) => { } }) {
  // const [dropSquareStyle, setDropSquareStyle] = React.useState({});
  // const [squareStyles, setSquareStyles] = React.useState({});

  // const squareStyling = (history) => {
  //   const sourceSquare = history.length && history[history.length - 1].from;
  //   const targetSquare = history.length && history[history.length - 1].to;

  //   return {
  //     ...(history.length && {
  //       [sourceSquare]: {
  //         backgroundColor: "rgba(255, 255, 0, 0.4)"
  //       }
  //     }),
  //     ...(history.length && {
  //       [targetSquare]: {
  //         backgroundColor: "rgba(255, 255, 0, 0.4)"
  //       }
  //     })
  //   };
  // };

  const squareStyling = (lastMove) => {
    if (!lastMove) {
      return {};
    }

    return {
      [lastMove.sourceSquare]: {
        backgroundColor: "rgba(255, 255, 0, 0.4)"
      },
      [lastMove.targetSquare]: {
        backgroundColor: "rgba(255, 255, 0, 0.4)"
      }
    };

    // const sourceSquare = lastMove.from;
    // const targetSquare = lastMove.to;

    // return {
    //   ...(lastMove && {
    //     [sourceSquare]: {
    //       backgroundColor: "rgba(255, 255, 0, 0.4)"
    //     }
    //   }),
    //   ...(lastMove && {
    //     [targetSquare]: {
    //       backgroundColor: "rgba(255, 255, 0, 0.4)"
    //     }
    //   })
    // };
  };

  // const onDrop = ({ sourceSquare, targetSquare }) => {
  //   try {
  //     gameRef.current.move({
  //       from: sourceSquare,
  //       to: targetSquare,
  //       promotion: "q" // warn: always promote to a queen
  //     });
  //   } catch (error) {
  //     return;
  //   }

  //   // setFen(gameRef.current.fen());
  //   setSquareStyles(squareStyling(gameRef.current.history({ verbose: true })))
  //   onMoveFn(gameRef.current);
  // };

  // const onDragOverSquare = _ => {
  //   setDropSquareStyle({ boxShadow: "inset 0 0 1px 2px rgb(255, 255, 0)" })
  // };

  return (
    <Chessboard
      id="board"
      width={300}
      position={fen}
      onDrop={onDropFn}
      boardStyle={{}}
      squareStyles={squareStyling(lastMove)}
      // dropSquareStyle={dropSquareStyle}
      dropSquareStyle={{ boxShadow: "inset 0 0 1px 2px rgb(255, 255, 0)" }}
      // onDragOverSquare={onDragOverSquare}
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
const analyzeSysPrompt = `
Explain the idea behind the most last move in a given chess game.

Do not explain the previous moves in the game; focus only on this current move.
Do not redundantly reiterate just what the move was; instead immediately explain the idea behind it. Get to the point. Do not waste words like "The last move was the knight move e4"; Instead just explain "e4 attacks the queen and ..."
Explain concisely in no more than 5 sentences.
Explain briefly the key idea behind the move and if this is a good move.
Explain at a 1800 ELO level.
`.trim();

// FEN v. PGN?
function analyzeHumPrompt(game) {
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

const gptModel = "gpt-3.5-turbo";
const gptTemperature = 0.7;

function Analyze() {
  // LLM generation
  const [explanation, setExplanation] = React.useState("");
  const respRef = useRef("");
  const sourceRef = useRef(null);

  // the game
  const gameRef = useRef(new Chess());
  const [fen, setFen] = React.useState("start");
  const [lastMove, setLastMove] = React.useState(null);

  const onDropFn = ({ sourceSquare, targetSquare }) => {
    try {
      gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q" // warn: always promote to a queen
      });
    } catch (error) {
      return;
    }

    setFen(gameRef.current.fen());
    setLastMove({ sourceSquare, targetSquare });

    respRef.current = "";
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
          "content": analyzeSysPrompt
        },
        {
          "role": "user",
          "content": analyzeHumPrompt(gameRef.current)
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
          respRef.current = respRef.current + text;
          setExplanation(respRef.current);
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
        <Board
          fen={fen}
          lastMove={lastMove}
          onDropFn={onDropFn}
        />
        <div className="px-8 w-[600px] max-h-[600px] overflow-auto">
          { explanation
            ? <div>
                <div className="font-bold">{gptModel} says</div>
                <div>{explanation}</div>
              </div>
            : <div>
                <span>Make a move on the board.</span>
                {/* <span>Make a move on the board or load a position with FEN</span>
                <input type="text" id="fen" class="border border-gray-500 text-sm rounded-md w-full p-1 mt-6" placeholder="8/6pk/6rp/p4Q2/1bp4P/3qB1P1/5P2/2R3K1 w - - 1 49" required />
                <button type="button" class="mt-2 px-3 py-2 text-sm text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800">Load</button> */}
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// TODO: remove be consise
const playSysPrompt = `
Play the best chess move.
Let's think step by step and write out our reasoning for the best move.

Follow these syntactic rules carefully.
Finally, return the best move in Standard Algebraic Notation on its own on the last line.
Return just the move on its own line like "e4"; do not return the full PGN or the turn number. For example, return "d5" instead of "1...d5"
Do not return the best move in quotes.
Do not end the the last line with a period after the move

Be very concise. Only think for at most 2 sentences.
`.trim();

// FEN v. PGN?
function playHumPrompt(game) {
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

// human playing white and GPT playing black
function Play() {
  const [turn, setTurn] = React.useState("white");
  const [resp, setResp] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const respRef = useRef("");
  const sourceRef = useRef(null);
  const gameRef = useRef(new Chess());

  useEffect(() => {
    if (generating || !resp) {
      return
    }
    console.log(resp)
    let move = resp.split(/\s+/).pop();
    console.log("move: " + move)
    // if there is a trailing period after the move, remove it
    if (move.endsWith(".")) {
      move = move.split(".").pop();
    }
    if (move.includes(".")) {
      move = move.split(".").pop();
    }
    console.log("move: " + move)
    gameRef.current.move(move);
  }, [generating]);

  const onMoveFn = async (game) => {
    if (turn === "black") {
      setTurn("white");
      return;
    }
    setTurn("black");
    setGenerating(true);

    respRef.current = "";
    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      setResp("WARN: REACT_APP_OPENAI_API_KEY required");
      return;
    }

    let url = "https://api.openai.com/v1/chat/completions";
    let data = {
      model: gptModel,
      temperature: gptTemperature,
      messages: [
        {
          "role": "system",
          "content": playSysPrompt
        },
        {
          "role": "user",
          "content": playHumPrompt(game)
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
          respRef.current = respRef.current + text;
          setResp(respRef.current);
        }
      } else {
        setGenerating(false);
        sourceRef.current.close();
      }
    });

    sourceRef.current.stream();
  };

  return (
    <div className="h-screen flex justify-center items-center">
      <div className="flex items-start">
        <Board game={gameRef.current} onMoveFn={onMoveFn}/>
        <div className="px-8 w-[600px] max-h-[600px] overflow-auto">
          { resp
            ? <div>
                <div className="font-bold">{gptModel} is thinking...</div>
                <div>{resp}</div>
              </div>
            : <div>
                <span>Start a game by making a move.</span>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Analyze />
    // <Play />
  )
}
