import React, { useRef } from "react";
import { Chess } from "chess.js";
import Chessboard from "chessboardjsx";
import { SSE } from "sse.js";

function Board({ onMoveFn = (history) => { }}) {
  const [fen, setFen] = React.useState("start");
  const [dropSquareStyle, setDropSquareStyle] = React.useState({});
  const [squareStyles, setSquareStyles] = React.useState({});

  const game = React.useRef(new Chess());

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
    onMoveFn(game.current.history());
  };

  const onDragOverSquare = _ => {
    setDropSquareStyle({ boxShadow: "inset 0 0 1px 2px rgb(255, 255, 0)" })
  };

  return (
    <Chessboard
      id="board"
      width={400}
      position={fen}
      onDrop={onDrop}
      boardStyle={{}}
      squareStyles={squareStyles}
      dropSquareStyle={dropSquareStyle}
      onDragOverSquare={onDragOverSquare}
    />
  )
}

// TODO: more structure on expected outputs. e.g. plans, threats, alternatives
// TODO: give it engine evals
const sysPrompt = `
Your task is to help explain what is going on in a given chess game.
Explain at a 1400 ELO level.
`.trim();

export default function App() {
  const [explanation, setExplanation] = React.useState("");
  const resultRef = useRef("");

  // TODO: singleton. should cancel in flight requests
  const onMoveFn = async (history) => {
    resultRef.current = "";
    if (!process.env.REACT_APP_OPENAI_API_KEY) {
      setExplanation("WARN: REACT_APP_OPENAI_API_KEY required");
      return;
    }

    let url = "https://api.openai.com/v1/chat/completions";
    let data = {
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      messages: [
        {
          "role": "system",
          "content": sysPrompt
        },
        {
          "role": "user",
          "content": `Game:\n${history}`
        }
      ],
      stream: true,
    };

    let source = new SSE(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
      },
      method: "POST",
      payload: JSON.stringify(data),
    });

    source.addEventListener("message", (e) => {
      if (e.data !== "[DONE]") {
        let payload = JSON.parse(e.data);
        let text = payload.choices[0].delta.content;
        if (text) {
          resultRef.current = resultRef.current + text;
          setExplanation(resultRef.current);
        }
      } else {
        source.close();
      }
    });

    source.stream();
  };

  // TODO: fix styles. espcially for text
  return (
    <div>
      <Board onMoveFn={onMoveFn}/>
      <div>{explanation}</div>
    </div>
  )
}

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
