import React, { useState } from 'react';

const BOARD_SIZE = 20;
const CELL_SIZE = 40;
const BOARD_PIXEL = (BOARD_SIZE - 1) * CELL_SIZE;
const STONE_RADIUS = 16;
const CENTER = Math.floor(BOARD_SIZE / 2);

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function checkWinner(board) {
  // 0: 없음, 1: 흑, 2: 백
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) continue;
      const player = board[y][x];
      for (let [dx, dy] of directions) {
        let count = 0;
        for (let i = 0; i < 5; i++) {
          const nx = x + dx * i;
          const ny = y + dy * i;
          if (
            nx >= 0 && nx < BOARD_SIZE &&
            ny >= 0 && ny < BOARD_SIZE &&
            board[ny][nx] === player
          ) {
            count++;
          } else {
            break;
          }
        }
        if (count === 5) return player;
      }
    }
  }
  return 0;
}

// 패턴 평가 함수 (간단 버전)
function evaluate(board, aiStone, playerStone) {
  // 점수: 5목 > 4목 > 3목 > 2목, 열린/막힘 가중치
  const patterns = [
    { score: 100000, length: 5 },
    { score: 10000, length: 4 },
    { score: 1000, length: 3 },
    { score: 100, length: 2 },
  ];
  let score = 0;
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  // AI 점수
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== aiStone) continue;
      for (let [dx, dy] of directions) {
        for (let { score: s, length } of patterns) {
          let cnt = 0;
          for (let i = 0; i < length; i++) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === aiStone) cnt++;
            else break;
          }
          if (cnt === length) {
            // 열린지 체크
            let before_x = x - dx, before_y = y - dy;
            let after_x = x + dx * length, after_y = y + dy * length;
            let open_ends = 0;
            if (before_x >= 0 && before_x < BOARD_SIZE && before_y >= 0 && before_y < BOARD_SIZE && board[before_y][before_x] === 0) open_ends++;
            if (after_x >= 0 && after_x < BOARD_SIZE && after_y >= 0 && after_y < BOARD_SIZE && board[after_y][after_x] === 0) open_ends++;
            if (length === 5) score += s;
            else if (open_ends > 0) score += s * open_ends;
          }
        }
      }
    }
  }
  // 플레이어 점수(방어)
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== playerStone) continue;
      for (let [dx, dy] of directions) {
        for (let { score: s, length } of patterns) {
          let cnt = 0;
          for (let i = 0; i < length; i++) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === playerStone) cnt++;
            else break;
          }
          if (cnt === length) {
            let before_x = x - dx, before_y = y - dy;
            let after_x = x + dx * length, after_y = y + dy * length;
            let open_ends = 0;
            if (before_x >= 0 && before_x < BOARD_SIZE && before_y >= 0 && before_y < BOARD_SIZE && board[before_y][before_x] === 0) open_ends++;
            if (after_x >= 0 && after_x < BOARD_SIZE && after_y >= 0 && after_y < BOARD_SIZE && board[after_y][after_x] === 0) open_ends++;
            if (length === 5) score -= s;
            else if (open_ends > 0) score -= s * open_ends;
          }
        }
      }
    }
  }
  return score;
}

// 미니맥스 + 알파베타 (깊이: depth)
function minimax(board, depth, alpha, beta, maximizing, aiStone, playerStone) {
  const winner = checkWinner(board);
  if (winner === aiStone) return [1000000, null];
  if (winner === playerStone) return [-1000000, null];
  if (depth === 0) return [evaluate(board, aiStone, playerStone), null];
  let moves = [];
  // 최근 돌 주변만 탐색(최대 2칸 이내)
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== 0) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && board[ny][nx] === 0) {
              moves.push([ny, nx]);
            }
          }
        }
      }
    }
  }
  if (moves.length === 0) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === 0) moves.push([y, x]);
      }
    }
  }
  moves = Array.from(new Set(moves.map(([y, x]) => y + ',' + x))).map(s => s.split(',').map(Number));
  let bestMove = null;
  if (maximizing) {
    let maxEval = -Infinity;
    for (let [y, x] of moves) {
      board[y][x] = aiStone;
      const [evalScore] = minimax(board, depth - 1, alpha, beta, false, aiStone, playerStone);
      board[y][x] = 0;
      if (evalScore > maxEval) {
        maxEval = evalScore;
        bestMove = [y, x];
      }
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return [maxEval, bestMove];
  } else {
    let minEval = Infinity;
    for (let [y, x] of moves) {
      board[y][x] = playerStone;
      const [evalScore] = minimax(board, depth - 1, alpha, beta, true, aiStone, playerStone);
      board[y][x] = 0;
      if (evalScore < minEval) {
        minEval = evalScore;
        bestMove = [y, x];
      }
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return [minEval, bestMove];
  }
}

const DIFFICULTY_LEVELS = [
  { label: 'Easy', depth: 1 },
  { label: 'Normal', depth: 2 },
  { label: 'Hard', depth: 3 },
  { label: 'TINI 모드', depth: 4 },
];

function getAdjacentEmpty(board, y, x) {
  const dirs = [
    [0, 1], [1, 0], [0, -1], [-1, 0]
  ];
  for (let [dy, dx] of dirs) {
    const ny = y + dy, nx = x + dx;
    if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && board[ny][nx] === 0) {
      return [ny, nx];
    }
  }
  // 만약 상하좌우가 다 차있으면, 랜덤 빈칸
  for (let yy = 0; yy < BOARD_SIZE; yy++) {
    for (let xx = 0; xx < BOARD_SIZE; xx++) {
      if (board[yy][xx] === 0) return [yy, xx];
    }
  }
  return null;
}

export default function Gomoku() {
  const [board, setBoard] = useState(createEmptyBoard());
  const [turn, setTurn] = useState(1); // 1: 흑, 2: 백
  const [winner, setWinner] = useState(0);
  const [lastMove, setLastMove] = useState(null);
  const [selecting, setSelecting] = useState(true);
  const [selectingDifficulty, setSelectingDifficulty] = useState(false);
  const [playerStone, setPlayerStone] = useState(1); // 1: 흑, 2: 백
  const [aiStone, setAiStone] = useState(2);
  const [difficulty, setDifficulty] = useState(DIFFICULTY_LEVELS[1]);
  const [firstPlayerMove, setFirstPlayerMove] = useState(null);

  function aiMove(newBoard, aiStone, playerStone, depth, firstPlayerMove) {
    // 첫 수(선공)라면 중앙에 둠
    if (newBoard.flat().every(cell => cell === 0)) {
      return [CENTER, CENTER];
    }
    // 플레이어가 흑이고 첫 수를 둔 직후라면, AI는 그 돌의 상하좌우 중 한 곳에 둠
    if (firstPlayerMove && newBoard.flat().filter(cell => cell !== 0).length === 1) {
      return getAdjacentEmpty(newBoard, firstPlayerMove[0], firstPlayerMove[1]);
    }
    const [, move] = minimax(newBoard, depth, -Infinity, Infinity, true, aiStone, playerStone);
    return move;
  }

  function getSvgCoords(e) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const svg = e.target.closest('svg');
    const rect = svg.getBoundingClientRect();
    // 스크롤/확대 등에도 정확하게 SVG 좌표로 변환
    const scaleX = svg.viewBox ? BOARD_PIXEL / svg.viewBox.baseVal.width : 1;
    const scaleY = svg.viewBox ? BOARD_PIXEL / svg.viewBox.baseVal.height : 1;
    const x = (clientX - rect.left) * (svg.width.baseVal.value / rect.width);
    const y = (clientY - rect.top) * (svg.height.baseVal.value / rect.height);
    return [x, y];
  }

  function handleClickBoard(e) {
    if (winner || selecting || selectingDifficulty) return;
    const [offsetX, offsetY] = getSvgCoords(e);
    const x = Math.round(offsetX / CELL_SIZE);
    const y = Math.round(offsetY / CELL_SIZE);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    if (board[y][x] !== 0) return;
    if (turn !== playerStone) return;
    const newBoard = board.map(row => row.slice());
    newBoard[y][x] = playerStone;
    setLastMove([y, x]);
    setFirstPlayerMove(firstPlayerMove === null ? [y, x] : firstPlayerMove);
    const win = checkWinner(newBoard);
    setBoard(newBoard);
    if (win) {
      setWinner(win);
    } else {
      setTurn(aiStone);
      setTimeout(() => {
        const aiYX = aiMove(newBoard, aiStone, playerStone, difficulty.depth, firstPlayerMove === null ? [y, x] : firstPlayerMove);
        if (aiYX) {
          const [aiY, aiX] = aiYX;
          newBoard[aiY][aiX] = aiStone;
          setLastMove([aiY, aiX]);
          const win2 = checkWinner(newBoard);
          setBoard(newBoard);
          if (win2) setWinner(win2);
          else setTurn(playerStone);
        }
      }, 400);
    }
  }

  function handleRestart() {
    setBoard(createEmptyBoard());
    setTurn(1);
    setWinner(0);
    setLastMove(null);
    setSelecting(true);
    setSelectingDifficulty(false);
    setPlayerStone(1);
    setAiStone(2);
    setDifficulty(DIFFICULTY_LEVELS[1]);
    setFirstPlayerMove(null);
  }

  function handleSelectStone(stone) {
    setPlayerStone(stone);
    setAiStone(stone === 1 ? 2 : 1);
    setTurn(1); // 흑부터 시작
    setSelecting(false);
    setSelectingDifficulty(true);
    setFirstPlayerMove(null);
  }

  function handleSelectDifficulty(level) {
    setDifficulty(level);
    setSelectingDifficulty(false);
    // AI가 선공(흑)일 때 중앙에 자동으로 두기
    if (playerStone === 2) {
      const newBoard = createEmptyBoard();
      newBoard[CENTER][CENTER] = 1;
      setBoard(newBoard);
      setLastMove([CENTER, CENTER]);
      setTurn(2); // 백(플레이어) 차례
      setFirstPlayerMove(null);
    }
  }

  // 모바일 대응: SVG와 버튼에 터치 이벤트 추가, 반응형 스타일 적용
  const boardContainerStyle = {
    display: 'inline-block',
    background: '#deb887',
    padding: 20,
    borderRadius: 10,
    boxShadow: '0 0 10px #aaa',
    maxWidth: '100vw',
    overflowX: 'auto',
    touchAction: 'manipulation',
  };
  const svgStyle = {
    background: '#deb887',
    cursor: winner ? 'default' : 'pointer',
    maxWidth: '100vw',
    height: 'auto',
    touchAction: 'manipulation',
    display: 'block',
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 30 }}>
      <h2>오목 게임 (React)</h2>
      {selecting ? (
        <div style={{ margin: '60px auto', display: 'inline-block', background: '#deb887', padding: 40, borderRadius: 10 }}>
          <div style={{ fontSize: 28, marginBottom: 30 }}>돌을 선택하세요</div>
          <button
            onClick={() => handleSelectStone(1)}
            style={{
              width: 80, height: 80, marginRight: 30, fontSize: 22, borderRadius: 10, border: '2px solid #222', background: '#222', color: '#fff', cursor: 'pointer'
            }}
          >
            흑
          </button>
          <button
            onClick={() => handleSelectStone(2)}
            style={{
              width: 80, height: 80, fontSize: 22, borderRadius: 10, border: '2px solid #aaa', background: '#fff', color: '#222', cursor: 'pointer'
            }}
          >
            백
          </button>
        </div>
      ) : selectingDifficulty ? (
        <div style={{ margin: '60px auto', display: 'inline-block', background: '#deb887', padding: 40, borderRadius: 10 }}>
          <div style={{ fontSize: 28, marginBottom: 30 }}>난이도를 선택하세요</div>
          {DIFFICULTY_LEVELS.map(level => (
            <button
              key={level.label}
              onClick={() => handleSelectDifficulty(level)}
              style={{
                width: 120, height: 60, margin: 10, fontSize: 22, borderRadius: 10, border: '2px solid #222', background: '#fff', color: '#222', cursor: 'pointer'
              }}
            >
              {level.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={boardContainerStyle}>
          <svg
            width={BOARD_PIXEL + 1}
            height={BOARD_PIXEL + 1}
            style={svgStyle}
            onClick={handleClickBoard}
            onTouchStart={handleClickBoard}
          >
            {/* 격자판 */}
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
              <g key={i}>
                {/* 세로선 */}
                <line
                  x1={i * CELL_SIZE}
                  y1={0}
                  x2={i * CELL_SIZE}
                  y2={BOARD_PIXEL}
                  stroke="#333"
                  strokeWidth={1}
                />
                {/* 가로선 */}
                <line
                  x1={0}
                  y1={i * CELL_SIZE}
                  x2={BOARD_PIXEL}
                  y2={i * CELL_SIZE}
                  stroke="#333"
                  strokeWidth={1}
                />
              </g>
            ))}
            {/* 돌 */}
            {board.map((row, y) =>
              row.map((cell, x) =>
                cell !== 0 ? (
                  <circle
                    key={x + '-' + y}
                    cx={x * CELL_SIZE}
                    cy={y * CELL_SIZE}
                    r={STONE_RADIUS}
                    fill={cell === 1 ? '#222' : '#fff'}
                    stroke={lastMove && lastMove[0] === y && lastMove[1] === x ? 'red' : cell === 2 ? '#aaa' : 'none'}
                    strokeWidth={lastMove && lastMove[0] === y && lastMove[1] === x ? 3 : 2}
                  />
                ) : null
              )
            )}
          </svg>
          <div style={{ marginTop: 20 }}>
            {winner
              ? <h3>{winner === playerStone ? '플레이어 승리!' : 'AI 승리!'}</h3>
              : <span>현재 턴: {turn === playerStone ? (playerStone === 1 ? '흑(플레이어)' : '백(플레이어)') : (aiStone === 1 ? '흑(AI)' : '백(AI)')}</span>
            }
          </div>
          <button
            onClick={handleRestart}
            onTouchStart={handleRestart}
            style={{ marginTop: 10, padding: '8px 20px', fontSize: 16 }}
          >
            다시하기
          </button>
        </div>
      )}
    </div>
  );
} 