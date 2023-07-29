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
      boardStyle={{
        borderRadius: "5px",
        boxShadow: `0 5px 15px rgba(0, 0, 0, 0.5)`
      }}
      squareStyles={squareStyles}
      dropSquareStyle={dropSquareStyle}
      onDragOverSquare={onDragOverSquare}
    />
  )
}

export default function App() {
  const [explanation, setExplanation] = React.useState("");
  const resultRef = useRef("");

  const onMoveFn = async (history) => {
    resultRef.current = "";

    // TODO: use chat 3.5 model
    let url = "https://api.openai.com/v1/completions";
    let data = {
      model: "text-davinci-003",
      prompt: `explain this chess game so far ${history}`,
      temperature: 0.7,
      stream: true,
      max_tokens: 2000,
      n: 1,
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
      if (e.data != "[DONE]") {
        let payload = JSON.parse(e.data);
        let text = payload.choices[0].text;
        resultRef.current = resultRef.current + text;
        setExplanation(resultRef.current);
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
      <pre>{explanation}</pre>
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
