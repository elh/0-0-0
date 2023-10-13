import React, { useRef } from "react";
import { Chess } from "chess.js";
import Chessboard from "chessboardjsx";
import { SSE } from "sse.js";
import GithubMark from './assets/github-mark.png';

function Board({ disabled, fen, lastMove, onDropFn = ({ sourceSquare, targetSquare }) => { } }) {
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
  };

  return (
    <Chessboard
      id="board"
      width={300}
      position={fen}
      onDrop={onDropFn}
      boardStyle={{}}
      squareStyles={squareStyling(lastMove)}
      dropSquareStyle={{ boxShadow: "inset 0 0 1px 2px rgb(255, 255, 0)" }}
      draggable={!disabled}
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
Explain at a 2000 ELO level.
`.trim();

function humPrompt(game) {
  const lastTurn = game.turn() === "w" ? "Black" : "White"; // note this is flipped
  const moves = game.moves();
  const pgn = game.pgn();
  const fen = game.fen();
  const ascii = game.ascii();
  const history = game.history();
  return `
Last Move:
${lastTurn} played ${history[history.length - 1]}

Candidate Moves:
${moves}

PGN:
${pgn}

FEN:
${fen}

ASCII representation of the board:
${ascii}
`.trim();
}

const gptModelPlay = "gpt-3.5-turbo-instruct";
const gptModelAnalyze = "gpt-4";
const gptTemperature = 0.7;

// HACK: I added a lot of random checks because I wasn't sure if I really wanted to switch.
// gpt-3.5-turbo-instruct is surprisingly good with just the PGN. Consider cleaning up later.
const isChatModel = {
  "gpt-3.5-turbo-instruct": false,
  "gpt-3.5-turbo": true,
  "gpt-4": true
}

// Analyze mode: play out a game and GPT will explain moves.
function Analyze({ openAIAPIKey }) {
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
    if (!openAIAPIKey) {
      setExplanation("OpenAI API Key is required");
      return;
    }

    let url = "https://api.openai.com/v1/chat/completions";
    let data = {
      model: gptModelAnalyze,
      temperature: gptTemperature,
      messages: [
        {
          "role": "system",
          "content": analyzeSysPrompt
        },
        {
          "role": "user",
          "content": humPrompt(gameRef.current)
        }
      ],
      stream: true,
    };
    if (!isChatModel[gptModelAnalyze]) {
      url = "https://api.openai.com/v1/completions";
      data = {
        model: gptModelAnalyze,
        temperature: gptTemperature,
        prompt: analyzeSysPrompt + "\n" + humPrompt(gameRef.current),
        max_tokens: 1024,
        stream: true,
      };
    }

    // kill current stream if it exists
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    sourceRef.current = new SSE(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIAPIKey}`,
      },
      method: "POST",
      payload: JSON.stringify(data),
    });

    sourceRef.current.addEventListener("message", (e) => {
      if (e.data !== "[DONE]") {
        let payload = JSON.parse(e.data);
        let text = isChatModel[gptModelAnalyze] ? payload.choices[0].delta.content : payload.choices[0].text;
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
    <div className="flex justify-center items-center">
      <div className="flex items-start">
        <Board
          fen={fen}
          lastMove={lastMove}
          onDropFn={onDropFn}
          disabled={openAIAPIKey === ""}
        />
        <div className="px-8 w-[600px] max-h-[600px] overflow-auto">
          { explanation
            ? <div>
                <div className="font-bold">{gptModelAnalyze} says</div>
                <div>{explanation}</div>
              </div>
            : <div>
                <span>Make moves on the board for {gptModelAnalyze} to analyze.</span>
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

const playSysPrompt = `
Play the best chess move.
Let's think step by step and write out our reasoning and then finally write the best move by itself on the final line.
You have been provided a list of all candidate moves. The best move is in that list.

Follow these syntactic rules carefully:
Write the best move in Standard Algebraic Notation on the last line. You must return a move from the list of candidate moves.
Do not write the full PGN or the turn number. For example, write "d5" instead of "1...d5"
Do not write the best move in quotes.
Do not end the the last line with a period after the move.
`.trim();

// Play mode: play against GPT
// Human plays white and GPT plays black
function Play({ openAIAPIKey }) {
  // LLM generation
  const [resp, setResp] = React.useState("");
  const [lastPGN, setLastPGN] = React.useState("");
  const respRef = useRef("");
  const sourceRef = useRef(null);

  // the game
  const gameRef = useRef(new Chess());
  const [fen, setFen] = React.useState("start");
  const [lastMove, setLastMove] = React.useState(null);

  const [gameOver, setGameOver] = React.useState(false);
  const [invalidAIMove, setInvalidAIMove] = React.useState(false);

  const playAIMove = (move) => {
    // handle invalid moves
    try {
      gameRef.current.move(move);
    } catch (error) {
      setInvalidAIMove(true);
      return;
    }

    setFen(gameRef.current.fen());
    const lastMoveFromHistory = gameRef.current.history({ verbose: true }).pop();
    setLastMove({sourceSquare: lastMoveFromHistory.from, targetSquare: lastMoveFromHistory.to});
    if (gameRef.current.isGameOver()) {
      setGameOver(true);
    }
  };

  const generateAIMove = () => {
    setLastPGN(gameRef.current.pgn());
    setInvalidAIMove(false);
    respRef.current = "";
    if (!openAIAPIKey) {
      setResp("OpenAI API Key is required");
      return;
    }

    let url = "https://api.openai.com/v1/chat/completions";
    let data = {
      model: gptModelPlay,
      temperature: gptTemperature,
      messages: [
        {
          "role": "system",
          "content": playSysPrompt
        },
        {
          "role": "user",
          "content": humPrompt(gameRef.current)
        }
      ],
      stream: true,
    };
    if (!isChatModel[gptModelPlay]) {
      // do not CoT for non-chat models. just give the PGN so far and ask for a completion of it.
      url = "https://api.openai.com/v1/completions";
      data = {
        model: gptModelPlay,
        temperature: gptTemperature,
        prompt: gameRef.current.pgn(),
        max_tokens: 16, // could be something like 50... 0-0-0
        stream: true,
      };
    }

    // kill current stream if it exists
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    sourceRef.current = new SSE(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIAPIKey}`,
      },
      method: "POST",
      payload: JSON.stringify(data),
    });

    sourceRef.current.addEventListener("message", (e) => {
      if (e.data !== "[DONE]") {
        let payload = JSON.parse(e.data);
        let text = isChatModel[gptModelPlay] ? payload.choices[0].delta.content : payload.choices[0].text;
        if (text) {
          respRef.current = respRef.current + text;
          setResp(respRef.current);
        }
      } else {
        sourceRef.current.close();

        let move = "";
        if (isChatModel[gptModelPlay]) {
          // if chat model, the move is the final space separated substring.
          // response is CoT-ed text.
          move = respRef.current.split(/\s+/).pop();
          if (move.endsWith(".")) {
            move = move.slice(0, -1);
          }
          if (move.includes(".")) {
            move = move.split(".").pop();
          }
        } else {
          // else, the move is the first space separated substring after the first period.
          // response is a PGN continuation.

          // split respRef.current by spaces and move is the first substring without a period
          const words = respRef.current.trim().split(/\s+/);
          for (let i = 0; i < words.length; i++) {
            if (!words[i].endsWith(".")) {
              move = words[i];
              break;
            }
          }
          console.log(words)
        }
        playAIMove(move);
      }
    });

    sourceRef.current.stream();
  };

  const onDropFn = ({ sourceSquare, targetSquare }) => {
    if (gameRef.current.turn() === "b") {
      return;
    }
    if (gameOver) {
      return;
    }

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

    if (gameRef.current.isGameOver()) {
      setGameOver(true);
    } else {
      generateAIMove();
    }
  };

  return (
    <div className="flex justify-center items-center">
      <div className="flex items-start">
        <Board
          fen={fen}
          lastMove={lastMove}
          onDropFn={onDropFn}
          disabled={openAIAPIKey === ""}
        />
        <div className="px-8 w-[600px] max-h-[600px] overflow-auto">
          { resp
            ? <div>
                { !isChatModel[gptModelPlay] &&
                  <div className="text-gray-600 mb-4">{lastPGN}</div>
                }
                <div className="font-bold">{gptModelPlay}:</div>
                <div>{resp.trim()}</div>
                { invalidAIMove &&
                  <div className="pt-8">
                    <div className="text-red-600">Invalid move :(</div>
                    <button
                      type="button"
                      className="mt-2 px-2 py-1 text-sm text-center text-red-600 border border-red-600 rounded-md hover:bg-gray-100"
                      onClick={() => generateAIMove()}>
                      Try Again
                    </button>
                  </div>
                }
                { gameOver &&
                  <div className="pt-8">
                    <div className="font-bold">Game Over</div>
                    <button
                      type="button"
                      className="mt-2 px-2 py-1 text-sm text-center text-gray-600 border border-gray-600 rounded-md hover:bg-gray-100"
                      onClick={() => {
                        gameRef.current.reset();
                        setFen(gameRef.current.fen());
                        setGameOver(false);
                        setLastMove(null);
                        setResp("");
                      }}>
                      Play Again!
                    </button>
                  </div>
                }
              </div>
            : <div>
                <span>Start a game against {gptModelPlay} by making a move.</span>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// If REACT_APP_OPENAI_API_KEY env var is set, use it. else, it must be provided in app bring-your-own-key.
export default function App() {
  const [mode, setMode] = React.useState("play");
  const [openAIAPIKey, setOpenAIAPIKey] = React.useState(process.env.REACT_APP_OPENAI_API_KEY ? process.env.REACT_APP_OPENAI_API_KEY : "");

  return (
    <div>
      <div class="absolute top-4 right-4 flex items-center">
        <button
          type="button"
          className="mx-2 px-2 py-1 text-xs text-center text-gray-600 border border-gray-600 rounded-md hover:bg-gray-100"
          onClick={() => {
            const confirm = window.confirm("Are you sure? You will lose current game progress.");
            if (confirm) {
              setMode(mode === "play" ? "analyze" : "play");
            }
          }}>
            Switch to {mode === "play" ? "Analyze" : "Play"} mode ↗
        </button>
        <a href="https://github.com/elh/0-0-0">
          <img src={GithubMark} className="w-6 mx-1" alt="Github link to elh" />
        </a>
      </div>

      {/* On change, save this locally */}
      { openAIAPIKey === "" &&
        <div class="flex items-center justify-center mt-4">
          <label for="small-input" class="text-xs font-medium text-red-600">OpenAI API Key*</label>
          <input type="password" id="small-input" class="w-96 mx-2 px-2 py-1 text-xs text-gray-600 border border-red-600 rounded-md" onBlur={
            (e) => {
              if (e.target.value !== "") {
                setOpenAIAPIKey(e.target.value);
              }
            }
          } />
        </div>
      }

      <div class="mt-20">
        { mode === "play"
          ? <Play openAIAPIKey={openAIAPIKey} />
          : <Analyze openAIAPIKey={openAIAPIKey} />
        }
      </div>
    </div>
  )
}
