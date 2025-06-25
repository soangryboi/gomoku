import React, { useState, useEffect } from 'react';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 700;
const BOARD_SIZE = 16;
const CELL_SIZE = IS_MOBILE ? 48 : 40;
const BOARD_PIXEL = (BOARD_SIZE - 1) * CELL_SIZE;
const STONE_RADIUS = IS_MOBILE ? 20 : 16;
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

// 패턴 평가 함수 (열린/막힌 가중치 강화)
function evaluate(board, aiStone, playerStone) {
  // 열린/막힌 패턴 가중치
  const patterns = [
    { score: 100000, length: 5 },
    { score: 20000, length: 4 }, // 열린4
    { score: 8000, length: 4, blocked: true }, // 막힌4
    { score: 2000, length: 3 }, // 열린3
    { score: 500, length: 3, blocked: true }, // 막힌3
    { score: 200, length: 2 },
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
        for (let p of patterns) {
          let cnt = 0;
          for (let i = 0; i < p.length; i++) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === aiStone) cnt++;
            else break;
          }
          if (cnt === p.length) {
            let before_x = x - dx, before_y = y - dy;
            let after_x = x + dx * p.length, after_y = y + dy * p.length;
            let open_ends = 0;
            if (before_x >= 0 && before_x < BOARD_SIZE && before_y >= 0 && before_y < BOARD_SIZE && board[before_y][before_x] === 0) open_ends++;
            if (after_x >= 0 && after_x < BOARD_SIZE && after_y >= 0 && after_y < BOARD_SIZE && board[after_y][after_x] === 0) open_ends++;
            if (p.length === 5) score += p.score;
            else if (p.blocked && open_ends === 1) score += p.score;
            else if (!p.blocked && open_ends === 2) score += p.score;
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
        for (let p of patterns) {
          let cnt = 0;
          for (let i = 0; i < p.length; i++) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === playerStone) cnt++;
            else break;
          }
          if (cnt === p.length) {
            let before_x = x - dx, before_y = y - dy;
            let after_x = x + dx * p.length, after_y = y + dy * p.length;
            let open_ends = 0;
            if (before_x >= 0 && before_x < BOARD_SIZE && before_y >= 0 && before_y < BOARD_SIZE && board[before_y][before_x] === 0) open_ends++;
            if (after_x >= 0 && after_x < BOARD_SIZE && after_y >= 0 && after_y < BOARD_SIZE && board[after_y][after_x] === 0) open_ends++;
            if (p.length === 5) score -= p.score;
            else if (p.blocked && open_ends === 1) score -= p.score;
            else if (!p.blocked && open_ends === 2) score -= p.score;
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
  // 최근 돌 주변 1칸만 후보로
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && board[ny][nx] === 0) {
              moves.push([ny, nx]);
            }
          }
        }
      }
    }
  }
  
  // 중복 제거
  moves = Array.from(new Set(moves.map(([y, x]) => y + ',' + x))).map(s => s.split(',').map(Number));
  
  // 후보 수가 없으면 모든 빈 칸을 후보로
  if (moves.length === 0) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] === 0) moves.push([y, x]);
      }
    }
  }
  
  // 여전히 후보 수가 없으면 null 반환
  if (moves.length === 0) return [0, null];
  
  let bestMove = moves[0]; // 기본값 설정
  let bestEval = maximizing ? -Infinity : Infinity;
  
  if (maximizing) {
    for (let [y, x] of moves) {
      board[y][x] = aiStone;
      const [evalScore] = minimax(board, depth - 1, alpha, beta, false, aiStone, playerStone);
      board[y][x] = 0;
      if (evalScore > bestEval) {
        bestEval = evalScore;
        bestMove = [y, x];
      }
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return [bestEval, bestMove];
  } else {
    for (let [y, x] of moves) {
      board[y][x] = playerStone;
      const [evalScore] = minimax(board, depth - 1, alpha, beta, true, aiStone, playerStone);
      board[y][x] = 0;
      if (evalScore < bestEval) {
        bestEval = evalScore;
        bestMove = [y, x];
      }
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return [bestEval, bestMove];
  }
}

const DIFFICULTY_LEVELS = [
  { label: 'Easy', depth: 1 },
  { label: 'Normal', depth: 2 },
  { label: 'Hard', depth: 3 },
  { label: 'TINI 모드', depth: 3 },
  { label: 'TITIBO 모드', depth: 4 },
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
  const [aiThinking, setAiThinking] = useState(false);
  const [pendingMove, setPendingMove] = useState(null); // 임시 착수 위치
  const [showWelcome, setShowWelcome] = useState(true); // 환영 메시지 표시

  // 환영 메시지 3초 후 자동 숨김
  React.useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  function aiMove(newBoard, aiStone, playerStone, depth, firstPlayerMove) {
    if (newBoard.flat().every(cell => cell === 0)) {
      return [CENTER, CENTER];
    }
    if (firstPlayerMove && newBoard.flat().filter(cell => cell !== 0).length === 1) {
      const adjacent = getAdjacentEmpty(newBoard, firstPlayerMove[0], firstPlayerMove[1]);
      return adjacent || [CENTER, CENTER];
    }
    const [, move] = minimax(newBoard, depth, -Infinity, Infinity, true, aiStone, playerStone);
    // move가 null이면 안전한 기본값 반환
    if (!move) {
      // 빈 칸 중 하나를 찾아서 반환
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (newBoard[y][x] === 0) return [y, x];
        }
      }
      return [CENTER, CENTER]; // 최후의 수단
    }
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
    // viewBox와 실제 렌더링 크기 비율을 정확히 반영
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return [x, y];
  }

  // 방향키로 임시 돌 이동 (돌이 있어도 이동 가능)
  useEffect(() => {
    if (winner || selecting || selectingDifficulty || aiThinking) return;
    const handleKeyDown = (e) => {
      if (!pendingMove) return;
      let [y, x] = pendingMove;
      if (e.key === 'ArrowUp') y = Math.max(0, y - 1);
      if (e.key === 'ArrowDown') y = Math.min(BOARD_SIZE - 1, y + 1);
      if (e.key === 'ArrowLeft') x = Math.max(0, x - 1);
      if (e.key === 'ArrowRight') x = Math.min(BOARD_SIZE - 1, x + 1);
      if (e.key === 'Enter') handleConfirmMove();
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        setPendingMove([y, x]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingMove, winner, selecting, selectingDifficulty, aiThinking]);

  // 클릭 시 중앙에서 임시 돌 시작 (삭제)
  function handleClickBoard(e) {
    // 아무 동작 없음
    return;
  }

  // 모바일용 이동 버튼 (돌이 있어도 이동 가능)
  function renderMoveButtons() {
    if (!IS_MOBILE || !pendingMove || winner || aiThinking) return null;
    const [y, x] = pendingMove;
    const move = (dy, dx) => {
      const ny = Math.max(0, Math.min(BOARD_SIZE - 1, y + dy));
      const nx = Math.max(0, Math.min(BOARD_SIZE - 1, x + dx));
      setPendingMove([ny, nx]);
    };
    return (
      <div style={{ marginTop: 5, marginBottom: 5 }}>
        <div style={{ textAlign: 'center', marginBottom: 5 }}>
          <button onClick={() => move(-1, 0)} style={{ width: 45, height: 45, fontSize: 20, margin: 2 }}>↑</button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 5 }}>
          <button onClick={() => move(0, -1)} style={{ width: 45, height: 45, fontSize: 20, margin: 2 }}>←</button>
          <button onClick={() => move(1, 0)} style={{ width: 45, height: 45, fontSize: 20, margin: 2 }}>↓</button>
          <button onClick={() => move(0, 1)} style={{ width: 45, height: 45, fontSize: 20, margin: 2 }}>→</button>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button onClick={handleConfirmMove} style={{ width: 100, height: 35, fontSize: 16, background: '#222', color: '#fff', borderRadius: 5 }}>확인</button>
        </div>
      </div>
    );
  }

  // 착수(확인/Enter) 시에만 빈 칸인지 검사
  function handleConfirmMove() {
    if (!pendingMove || winner || aiThinking) return;
    const [y, x] = pendingMove;
    if (board[y][x] !== 0) return; // 빈 칸이 아니면 착수 불가
    const newBoard = board.map(row => row.slice());
    newBoard[y][x] = playerStone;
    setLastMove([y, x]);
    setFirstPlayerMove(firstPlayerMove === null ? [y, x] : firstPlayerMove);
    setPendingMove(null);
    const win = checkWinner(newBoard);
    setBoard(newBoard);
    if (win) {
      setWinner(win);
    } else {
      setTurn(aiStone);
      setAiThinking(true);
      setTimeout(() => {
        const aiYX = aiMove(newBoard, aiStone, playerStone, difficulty.depth, firstPlayerMove === null ? [y, x] : firstPlayerMove);
        if (aiYX) {
          const [aiY, aiX] = aiYX;
          newBoard[aiY][aiX] = aiStone;
          setLastMove([aiY, aiX]);
          const win2 = checkWinner(newBoard);
          setBoard(newBoard);
          if (win2) setWinner(win2);
          else {
            setTurn(playerStone);
            // 플레이어 차례가 되면 중앙에서 임시 돌 시작
            setPendingMove([CENTER, CENTER]);
          }
        }
        setAiThinking(false);
      }, 10);
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
      // 플레이어 차례일 때 중앙에서 임시 돌 시작
      setPendingMove([CENTER, CENTER]);
    } else {
      // 플레이어가 선공(흑)일 때 중앙에서 임시 돌 시작
      setPendingMove([CENTER, CENTER]);
    }
  }

  // 모바일 대응: SVG와 버튼에 터치 이벤트 추가, 반응형 스타일 적용
  const boardContainerStyle = {
    display: 'inline-block',
    background: '#deb887',
    padding: IS_MOBILE ? 10 : 20,
    borderRadius: 10,
    boxShadow: '0 0 10px #aaa',
    maxWidth: '100vw',
    overflowX: 'auto',
    touchAction: 'manipulation',
    // 모바일에서 불필요한 빈 공간 제거
    ...(IS_MOBILE && { 
      height: 'fit-content',
      margin: '10px auto',
      paddingBottom: 5
    }),
  };
  const svgStyle = {
    background: '#deb887',
    cursor: winner ? 'default' : 'pointer',
    minWidth: 320,
    maxWidth: 700,
    width: '100vw',
    height: BOARD_PIXEL + 1,
    display: 'block',
    // 모바일에서 SVG 크기 최적화
    ...(IS_MOBILE && {
      maxWidth: '90vw',
      width: '90vw',
    }),
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 30 }}>
      <h2>오목 게임 (React)</h2>
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px 40px',
          borderRadius: '10px',
          fontSize: '24px',
          fontWeight: 'bold',
          zIndex: 1000,
          animation: 'fadeInOut 3s ease-in-out'
        }}>
          김태은님 안녕하세요
        </div>
      )}
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
              {level.label === 'Easy' ? 'EASY(이준희실력)' : level.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={boardContainerStyle}>
          {aiThinking && <div style={{ color: 'red', fontWeight: 'bold', margin: 10 }}>AI 생각 중...</div>}
          <svg
            width="100vw"
            height={BOARD_PIXEL + 1}
            viewBox={`0 0 ${BOARD_PIXEL + 1} ${BOARD_PIXEL + 1}`}
            style={svgStyle}
            onClick={handleClickBoard}
            onTouchStart={handleClickBoard}
            tabIndex={0}
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
            {/* 임시 착수 위치 표시 */}
            {pendingMove && !winner && !aiThinking && (
              <circle
                cx={pendingMove[1] * CELL_SIZE}
                cy={pendingMove[0] * CELL_SIZE}
                r={STONE_RADIUS - 2}
                fill={turn === 1 ? '#222' : '#fff'}
                fillOpacity={0.5}
                stroke="blue"
                strokeWidth={2}
              />
            )}
          </svg>
          {/* 확인 버튼 및 모바일 이동 버튼 */}
          {pendingMove && !winner && !aiThinking && !IS_MOBILE && (
            <button
              onClick={handleConfirmMove}
              style={{ marginTop: 16, padding: '10px 30px', fontSize: 18, background: '#222', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              확인 (Enter)
            </button>
          )}
          {renderMoveButtons()}
          <div style={{ marginTop: IS_MOBILE ? 10 : 20 }}>
            {winner
              ? <h3 style={
                  difficulty.label === 'TINI 모드' && winner === playerStone 
                    ? { fontSize: '2.5em', fontWeight: 'bold', color: '#ff6b6b', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }
                    : difficulty.label === 'Easy' && winner === playerStone
                    ? { fontSize: '2.5em', fontWeight: 'bold', color: '#ff6b6b', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }
                    : difficulty.label === 'TITIBO 모드' && winner === playerStone
                    ? { fontSize: '3em', fontWeight: 'bold', color: '#ffd700', textShadow: '3px 3px 6px rgba(0,0,0,0.5)', animation: 'glow 2s ease-in-out infinite alternate' }
                    : {}
                }>
                  {difficulty.label === 'TINI 모드' && winner === playerStone 
                    ? '티티보 우승!!' 
                    : difficulty.label === 'Easy' && winner === playerStone
                    ? '이준띠띠 DOWN!!'
                    : difficulty.label === 'TITIBO 모드' && winner === playerStone
                    ? 'TITIBO 정복!!'
                    : winner === playerStone ? '플레이어 승리!' : 'AI 승리!'}
                </h3>
              : <span style={{ fontSize: IS_MOBILE ? '14px' : '16px' }}>현재 턴: {turn === playerStone ? (playerStone === 1 ? '흑(플레이어)' : '백(플레이어)') : (aiStone === 1 ? '흑(AI)' : '백(AI)')}</span>
            }
          </div>
          <button
            onClick={handleRestart}
            onTouchStart={handleRestart}
            style={{ 
              marginTop: IS_MOBILE ? 5 : 10, 
              padding: IS_MOBILE ? '6px 15px' : '8px 20px', 
              fontSize: IS_MOBILE ? 14 : 16 
            }}
          >
            다시하기
          </button>
        </div>
      )}
    </div>
  );
} 