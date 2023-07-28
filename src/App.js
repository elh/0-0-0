import React from "react";
import { Chess } from "chess.js";
import Chessboard from "chessboardjsx";

export default function App() {
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
  };

  const onDragOverSquare = _ => {
    setDropSquareStyle({ boxShadow: "inset 0 0 1px 4px rgb(255, 255, 0)" })
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

const squareStyling = (history) => {
  console.log(history)
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
