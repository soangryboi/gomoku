import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';

const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 700;
const BOARD_SIZE = 16;
const CELL_SIZE = IS_MOBILE ? 48 : 40;
const BOARD_PIXEL = (BOARD_SIZE - 1) * CELL_SIZE;
const STONE_RADIUS = IS_MOBILE ? 20 : 16;
const CENTER = Math.floor(BOARD_SIZE / 2);

// 난이도 설정 (AI 모델 모드 추가)
const DIFFICULTY_LEVELS = [
  { label: 'Easy', depth: 2 },
  { label: 'Normal', depth: 3 },
  { label: 'Hard', depth: 4 },
  { label: 'TINI 모드', depth: 4 },
  { label: 'TITIBO 모드', depth: 4 },
  { label: 'AI 모델', depth: 4 } // 새로운 AI 모델 모드
];

// AI 모델 로더 클래스
class AIModelLoader {
  constructor() {
    this.model = null;
    this.isLoaded = false;
    this.isLoading = false;
  }

  async loadModel() {
    if (this.isLoading) return;
    if (this.isLoaded) return;

    this.isLoading = true;
    try {
      // TensorFlow.js가 로드되었는지 확인
      if (typeof tf === 'undefined') {
        throw new Error('TensorFlow.js가 로드되지 않았습니다.');
      }

      // 모델 로드
      this.model = await tf.loadLayersModel('./web_model/model.json');
      this.isLoaded = true;
      console.log('AI 모델 로드 완료');
    } catch (error) {
      console.error('AI 모델 로드 실패:', error);
      this.isLoaded = false;
    } finally {
      this.isLoading = false;
    }
  }

  predict(board, currentPlayer) {
    if (!this.isLoaded || !this.model) {
      throw new Error('AI 모델이 로드되지 않았습니다.');
    }

    // 보드 상태를 모델 입력 형식으로 변환
    const state = this.createModelInput(board, currentPlayer);
    
    // 예측
    const input = tf.tensor4d(state, [1, 3, 15, 15]);
    const prediction = this.model.predict(input);
    const policy = prediction.arraySync()[0];
    
    // 텐서 정리
    input.dispose();
    prediction.dispose();
    
    return policy;
  }

  createModelInput(board, currentPlayer) {
    // 3채널 입력 생성: [흑돌, 백돌, 현재플레이어]
    const state = Array.from({ length: 3 }, () => 
      Array.from({ length: 15 }, () => Array(15).fill(0))
    );

    // 보드 상태 복사 (15x15로 크롭)
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        if (board[y][x] === 1) { // 흑돌
          state[0][y][x] = 1;
        } else if (board[y][x] === 2) { // 백돌
          state[1][y][x] = 1;
        }
      }
    }

    // 현재 플레이어 채널
    if (currentPlayer === 1) {
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          state[2][y][x] = 1;
        }
      }
    }

    return state;
  }

  getBestMove(board, currentPlayer, validMoves) {
    try {
      const policy = this.predict(board, currentPlayer);
      
      // 유효한 수 중에서 가장 높은 확률의 수 선택
      let bestMove = null;
      let bestProb = -1;

      for (const [y, x] of validMoves) {
        if (y < 15 && x < 15) { // 15x15 범위 내에서만
          const prob = policy[y * 15 + x];
          if (prob > bestProb) {
            bestProb = prob;
            bestMove = [y, x];
          }
        }
      }

      return bestMove || validMoves[0]; // 기본값
    } catch (error) {
      console.error('AI 모델 예측 실패:', error);
      return validMoves[0]; // 기본값
    }
  }
}

// 전역 AI 모델 인스턴스
const aiModelLoader = new AIModelLoader();

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

// 승리 체크 함수
function checkWinner(board) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) continue;
      const player = board[y][x];
      for (let [dx, dy] of directions) {
        let count = 1;
        // 정방향 확인
        for (let i = 1; i <= 4; i++) {
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
        // 역방향 확인
        for (let i = 1; i <= 4; i++) {
          const nx = x - dx * i;
          const ny = y - dy * i;
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

// 전역 MCTS 트리 캐시 (트리 재사용용)
let globalMCTSTree = null;

class MCTSNode {
  constructor(board, move = null, parent = null) {
    this.board = board.map(row => row.slice());
    this.move = move; // [y, x]
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.untriedMoves = this.getValidMoves();
  }

  getValidMoves() {
    const moves = [];
    const hasStones = this.board.flat().some(cell => cell !== 0);
    
    if (!hasStones) {
      // 첫 수는 중앙
      return [[CENTER, CENTER]];
    }
    
    // 돌 주변 2칸만 탐색 (수천 배 빠름)
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (this.board[y][x] !== 0) {
          // 주변 2칸 탐색
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const ny = y + dy, nx = x + dx;
              if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && 
                  this.board[ny][nx] === 0) {
                moves.push([ny, nx]);
              }
            }
          }
        }
      }
    }
    
    // 중복 제거
    const uniqueMoves = Array.from(new Set(moves.map(([y, x]) => y + ',' + x)))
      .map(s => s.split(',').map(Number));
    
    // 후보가 없으면 모든 빈칸 반환
    if (uniqueMoves.length === 0) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (this.board[y][x] === 0) {
            uniqueMoves.push([y, x]);
          }
        }
      }
    }
    
    return uniqueMoves;
  }

  isTerminal() {
    return checkWinner(this.board) !== 0 || this.untriedMoves.length === 0;
  }

  getUCB1(c) {
    if (this.visits === 0) return Infinity;
    return (this.wins / this.visits) + c * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }

  // 트리 재사용을 위한 보드 상태 해시
  getBoardHash() {
    return this.board.flat().join('');
  }
}

// 휴리스틱 rollout (완전 랜덤 대신)
function heuristicRollout(board, playerStone, aiStone) {
  const currentBoard = board.map(row => row.slice());
  let currentPlayer = playerStone;
  let moveCount = 0;
  
  while (moveCount < 50) {
    const winner = checkWinner(currentBoard);
    if (winner !== 0) {
      return winner;
    }
    
    // 유효한 수 찾기
    const validMoves = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (currentBoard[y][x] === 0) {
          validMoves.push([y, x]);
        }
      }
    }
    
    if (validMoves.length === 0) break;
    
    // 휴리스틱 기반 수 선택
    let selectedMove;
    if (Math.random() < 0.7) { // 70% 확률로 휴리스틱 사용
      selectedMove = selectHeuristicMove(currentBoard, validMoves, currentPlayer, aiStone, playerStone);
    } else { // 30% 확률로 랜덤
      selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    
    const [y, x] = selectedMove;
    currentBoard[y][x] = currentPlayer;
    currentPlayer = currentPlayer === playerStone ? aiStone : playerStone;
    moveCount++;
  }
  
  return 0; // 무승부
}

// 휴리스틱 수 선택
function selectHeuristicMove(board, validMoves, currentPlayer, aiStone, playerStone) {
  let bestMove = validMoves[0];
  let bestScore = -Infinity;
  
  for (const [y, x] of validMoves) {
    // 임시로 수를 두고 평가
    board[y][x] = currentPlayer;
    const score = improvedEvaluateMove(board, y, x, currentPlayer, aiStone, playerStone);
    board[y][x] = 0;
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = [y, x];
    }
  }
  
  return bestMove;
}

// 수 평가 (간단한 휴리스틱)
function evaluateMove(board, y, x, player) {
  let score = 0;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  
  for (const [dx, dy] of directions) {
    let count = 1;
    let openEnds = 0;
    
    // 정방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === player) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 역방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === player) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 점수 계산
    if (count >= 5) score += 10000;
    else if (count === 4 && openEnds >= 1) score += 1000;
    else if (count === 3 && openEnds >= 1) score += 100;
    else if (count === 2 && openEnds >= 1) score += 10;
  }
  
  return score;
}

// 트리 재사용을 위한 re-root 함수
function reRootTree(oldRoot, newBoard) {
  if (!oldRoot) return new MCTSNode(newBoard);
  
  // 새로운 보드와 일치하는 자식 찾기
  for (const child of oldRoot.children) {
    if (child.getBoardHash() === newBoard.flat().join('')) {
      // 트리 재구성
      child.parent = null;
      return child;
    }
  }
  
  // 일치하는 자식이 없으면 새 트리 생성
  return new MCTSNode(newBoard);
}

// 최적화된 MCTS 알고리즘
function mcts(board, iterations = 200, playerStone, aiStone) {
  // 트리 재사용
  const root = reRootTree(globalMCTSTree, board);
  
  for (let i = 0; i < iterations; i++) {
    let node = root;
    
    // Selection
    while (node.isTerminal() && node.children.length > 0) {
      node = selectChild(node);
    }
    
    // Expansion
    if (!node.isTerminal()) {
      const move = node.untriedMoves[Math.floor(Math.random() * node.untriedMoves.length)];
      const newBoard = node.board.map(row => row.slice());
      newBoard[move[0]][move[1]] = node.children.length % 2 === 0 ? playerStone : aiStone;
      const child = new MCTSNode(newBoard, move, node);
      node.children.push(child);
      node = child;
    }
    
    // Simulation (휴리스틱 rollout)
    const result = heuristicRollout(node.board, playerStone, aiStone);
    
    // Backpropagation
    while (node !== null) {
      node.visits++;
      if (result === aiStone) {
        node.wins++;
      }
      node = node.parent;
    }
  }
  
  // Best move 선택
  let bestChild = root.children[0];
  for (const child of root.children) {
    if (child.visits > bestChild.visits) {
      bestChild = child;
    }
  }
  
  // 트리 캐시 업데이트
  globalMCTSTree = root;
  
  return bestChild ? bestChild.move : null;
}

// Selection 단계
function selectChild(node) {
  const c = Math.sqrt(2);
  let bestChild = node.children[0];
  let bestUCB = bestChild.getUCB1(c);
  
  for (const child of node.children) {
    const ucb = child.getUCB1(c);
    if (ucb > bestUCB) {
      bestUCB = ucb;
      bestChild = child;
    }
  }
  
  return bestChild;
}

// 간단한 평가 함수 (시뮬레이션용)
function simpleEvaluate(board, playerStone, aiStone) {
  let score = 0;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) continue;
      const stone = board[y][x];
      
      for (let [dx, dy] of directions) {
        let count = 1;
        // 정방향 확인
        for (let i = 1; i <= 4; i++) {
          const nx = x + dx * i, ny = y + dy * i;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
            count++;
          } else break;
        }
        // 역방향 확인
        for (let i = 1; i <= 4; i++) {
          const nx = x - dx * i, ny = y - dy * i;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
            count++;
          } else break;
        }
        
        // 점수 계산
        if (stone === aiStone) {
          if (count >= 5) score += 1000;
          else if (count === 4) score += 100;
          else if (count === 3) score += 10;
        } else {
          if (count >= 5) score -= 1000;
          else if (count === 4) score -= 100;
          else if (count === 3) score -= 10;
        }
      }
    }
  }
  return score;
}

// 똑똑한 평가 함수 (시뮬레이션용)
function smartEvaluate(board, playerStone, aiStone, currentPlayer) {
  let score = 0;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) continue;
      const stone = board[y][x];
      
      for (let [dx, dy] of directions) {
        let count = 1;
        let openEnds = 0;
        
        // 정방향 확인
        for (let i = 1; i <= 4; i++) {
          const nx = x + dx * i, ny = y + dy * i;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[ny][nx] === stone) count++;
            else if (board[ny][nx] === 0) {
              openEnds++;
              break;
            } else break;
          } else break;
        }
        
        // 역방향 확인
        for (let i = 1; i <= 4; i++) {
          const nx = x - dx * i, ny = y - dy * i;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (board[ny][nx] === stone) count++;
            else if (board[ny][nx] === 0) {
              openEnds++;
              break;
            } else break;
          } else break;
        }
        
        // 점수 계산 (열린/막힌 구분)
        const isOpen = openEnds === 2;
        const isBlocked = openEnds === 0;
        const isSemiOpen = openEnds === 1;
        
        if (stone === currentPlayer) {
          if (count >= 5) score += 10000; // 승리
          else if (count === 4) {
            if (isOpen) score += 5000; // 열린 4
            else if (isSemiOpen) score += 1000; // 막힌 4
          }
          else if (count === 3) {
            if (isOpen) score += 500; // 열린 3
            else if (isSemiOpen) score += 100; // 막힌 3
          }
          else if (count === 2) {
            if (isOpen) score += 50; // 열린 2
            else if (isSemiOpen) score += 10; // 막힌 2
          }
        } else {
          // 상대방 수는 방어 차원에서 고려
          if (count >= 5) score -= 10000;
          else if (count === 4) {
            if (isOpen) score -= 5000;
            else if (isSemiOpen) score -= 1000;
          }
          else if (count === 3) {
            if (isOpen) score -= 500;
            else if (isSemiOpen) score -= 100;
          }
          else if (count === 2) {
            if (isOpen) score -= 50;
            else if (isSemiOpen) score -= 10;
          }
        }
      }
    }
  }
  
  return score;
}

// 똑똑한 수 선택 함수
function smartMoveSelection(validMoves, board, currentPlayer, playerStone, aiStone) {
  const moveScores = [];
  
  for (const move of validMoves) {
    const testBoard = board.map(row => row.slice());
    testBoard[move[0]][move[1]] = currentPlayer;
    
    let score = smartEvaluate(testBoard, playerStone, aiStone, currentPlayer);
    
    // 금수 체크 (페널티)
    if (checkDoubleOpenThree(testBoard, move[0], move[1], currentPlayer)) {
      score -= 10000; // 3-3 금수
    }
    if (checkDoubleOpenFour(testBoard, move[0], move[1], currentPlayer)) {
      score -= 10000; // 4-4 금수
    }
    if (checkOverline(testBoard, move[0], move[1], currentPlayer)) {
      score -= 10000; // 장목
    }
    
    // 승리 조건 체크 (보너스)
    if (checkWinner(testBoard) === currentPlayer) {
      score += 50000; // 즉시 승리
    }
    
    // 상대방 승리 방지 (보너스)
    const opponentBoard = board.map(row => row.slice());
    opponentBoard[move[0]][move[1]] = currentPlayer === playerStone ? aiStone : playerStone;
    if (checkWinner(opponentBoard) === (currentPlayer === playerStone ? aiStone : playerStone)) {
      score += 30000; // 상대방 승리 방지
    }
    
    moveScores.push({ move, score });
  }
  
  // 점수 순으로 정렬
  moveScores.sort((a, b) => b.score - a.score);
  
  // 상위 30% 중에서 랜덤 선택 (탐색과 활용의 균형)
  const topCount = Math.max(1, Math.floor(moveScores.length * 0.3));
  const topMoves = moveScores.slice(0, topCount);
  
  return topMoves[Math.floor(Math.random() * topMoves.length)].move;
}

// Simulation 단계 (똑똑한 랜덤)
function simulate(board, playerStone, aiStone) {
  const simBoard = board.map(row => row.slice());
  let currentPlayer = playerStone;
  let moveCount = 0;
  const maxMoves = 50; // 무한 루프 방지
  
  while (moveCount < maxMoves) {
    const winner = checkWinner(simBoard);
    if (winner !== 0) return winner;
    
    const validMoves = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (simBoard[y][x] === 0) {
          validMoves.push([y, x]);
        }
      }
    }
    
    if (validMoves.length === 0) return 0; // 무승부
    
    // 똑똑한 수 선택
    const bestMove = smartMoveSelection(validMoves, simBoard, currentPlayer, playerStone, aiStone);
    
    simBoard[bestMove[0]][bestMove[1]] = currentPlayer;
    currentPlayer = currentPlayer === playerStone ? aiStone : playerStone;
    moveCount++;
  }
  
  // 최대 이동 수에 도달하면 평가 함수로 승자 결정
  const finalScore = smartEvaluate(simBoard, playerStone, aiStone, aiStone);
  return finalScore > 0 ? aiStone : finalScore < 0 ? playerStone : 0;
}

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

// 3-3 금수 감지 함수
function checkDoubleOpenThree(board, y, x, stone) {
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  let openThreeCount = 0;
  
  // 임시로 돌을 놓아서 테스트
  board[y][x] = stone;
  
  for (let [dx, dy] of directions) {
    // 양방향으로 확인
    let count = 0;
    let openEnds = 0;
    
    // 정방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === stone) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 역방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === stone) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 열린 3인지 확인 (돌 3개 + 양쪽이 열려있음)
    if (count === 2 && openEnds === 2) {
      openThreeCount++;
    }
  }
  
  // 원래 상태로 복원
  board[y][x] = 0;
  
  return openThreeCount >= 2;
}

// 4-4 금수 감지 함수
function checkDoubleOpenFour(board, y, x, stone) {
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  let openFourCount = 0;
  
  // 임시로 돌을 놓아서 테스트
  board[y][x] = stone;
  
  for (let [dx, dy] of directions) {
    // 양방향으로 확인
    let count = 0;
    let openEnds = 0;
    
    // 정방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === stone) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 역방향 확인
    for (let i = 1; i <= 4; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === stone) count++;
        else if (board[ny][nx] === 0) {
          openEnds++;
          break;
        } else break;
      } else break;
    }
    
    // 열린 4인지 확인 (돌 4개 + 양쪽이 열려있음)
    if (count === 3 && openEnds === 2) {
      openFourCount++;
    }
  }
  
  // 원래 상태로 복원
  board[y][x] = 0;
  
  return openFourCount >= 2;
}

// 6목 이상 장목 감지 함수
function checkOverline(board, y, x, stone) {
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1]
  ];
  
  // 임시로 돌을 놓아서 테스트
  board[y][x] = stone;
  
  for (let [dx, dy] of directions) {
    let count = 1; // 현재 위치 포함
    
    // 정방향 확인
    for (let i = 1; i <= 5; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
        count++;
      } else break;
    }
    
    // 역방향 확인
    for (let i = 1; i <= 5; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === stone) {
        count++;
      } else break;
    }
    
    // 6목 이상이면 장목
    if (count >= 6) {
      board[y][x] = 0;
      return true;
    }
  }
  
  // 원래 상태로 복원
  board[y][x] = 0;
  return false;
}

// 금수 위치 찾기 (3-3, 4-4, 장목 포함)
function findForbiddenMoves(board, stone) {
  const forbidden = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) {
        // 3-3 금수 체크
        if (checkDoubleOpenThree(board, y, x, stone)) {
          forbidden.push([y, x, '3-3']);
          continue;
        }
        // 4-4 금수 체크
        if (checkDoubleOpenFour(board, y, x, stone)) {
          forbidden.push([y, x, '4-4']);
          continue;
        }
        // 장목 체크
        if (checkOverline(board, y, x, stone)) {
          forbidden.push([y, x, '장목']);
          continue;
        }
      }
    }
  }
  return forbidden;
}

// 개선된 수 평가 함수 (즉시승/즉시패, 금수, 패턴, 복수 위협, smartEvaluate)
function improvedEvaluateMove(board, y, x, player, aiStone, playerStone) {
  // 1. 즉시 승리/즉시 패배 감지
  board[y][x] = player;
  if (checkWinner(board) === player) {
    board[y][x] = 0;
    return 1000000; // 즉시 승리
  }
  // 상대가 바로 이길 수 있는 수 방어
  board[y][x] = player === aiStone ? playerStone : aiStone;
  if (checkWinner(board) === (player === aiStone ? playerStone : aiStone)) {
    board[y][x] = 0;
    return 900000; // 즉시 패배 방어
  }
  board[y][x] = 0;

  // 2. 금수 감점
  if (checkDoubleOpenThree(board, y, x, player) ||
      checkDoubleOpenFour(board, y, x, player) ||
      checkOverline(board, y, x, player)) {
    return -100000;
  }

  // 3. 패턴별 가중치 및 복수 위협 감지
  let score = 0;
  let openThrees = 0, openFours = 0;
  const directions = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dx, dy] of directions) {
    let count = 1, openEnds = 0;
    // 정방향
    for (let i = 1; i <= 4; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === player) count++;
        else if (board[ny][nx] === 0) { openEnds++; break; }
        else break;
      } else break;
    }
    // 역방향
    for (let i = 1; i <= 4; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (board[ny][nx] === player) count++;
        else if (board[ny][nx] === 0) { openEnds++; break; }
        else break;
      } else break;
    }
    // 패턴별 점수
    if (count >= 5) score += 100000;
    else if (count === 4 && openEnds === 2) { score += 10000; openFours++; }
    else if (count === 4 && openEnds === 1) score += 2000;
    else if (count === 3 && openEnds === 2) { score += 1000; openThrees++; }
    else if (count === 3 && openEnds === 1) score += 200;
    else if (count === 2 && openEnds === 2) score += 100;
    else if (count === 2 && openEnds === 1) score += 10;
  }
  // 복수 위협(더블 쓰렛)
  if (openFours >= 2) score += 5000;
  if (openThrees >= 2) score += 1000;

  // 4. smartEvaluate 점수 추가
  score += smartEvaluate(board, playerStone, aiStone, player);
  return score;
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
  const [forbiddenMoves, setForbiddenMoves] = useState([]); // 금수 위치
  const [moveCount, setMoveCount] = useState(0); // 현재 수순
  const [aiResigned, setAiResigned] = useState(false); // AI 기권 상태
  const [aiModelLoading, setAiModelLoading] = useState(false); // AI 모델 로딩 상태
  const [aiModelLoaded, setAiModelLoaded] = useState(false); // AI 모델 로드 완료 상태

  // 메모이제이션된 금수 위치 계산
  const forbiddenMovesMemo = useMemo(() => {
    if (selecting || selectingDifficulty || winner) return [];
    return findForbiddenMoves(board, playerStone);
  }, [board, playerStone, selecting, selectingDifficulty, winner]);

  // 메모이제이션된 수순 계산
  const moveCountMemo = useMemo(() => {
    if (selecting || selectingDifficulty) return 0;
    return board.flat().filter(cell => cell !== 0).length;
  }, [board, selecting, selectingDifficulty]);

  // 스크롤 위치 유지
  React.useEffect(() => {
    if (IS_MOBILE && !selecting && !selectingDifficulty) {
      const gameContainer = document.querySelector('.game-container');
      if (gameContainer) {
        gameContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [board, turn, aiThinking]);

  // 환영 메시지 자동 숨김
  useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => setShowWelcome(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  // 금수 위치 업데이트
  useEffect(() => {
    setForbiddenMoves(forbiddenMovesMemo);
  }, [forbiddenMovesMemo]);

  // 수순 업데이트
  useEffect(() => {
    setMoveCount(moveCountMemo);
  }, [moveCountMemo]);

  // 최적화된 AI 이동 함수
  const aiMove = useCallback((newBoard, aiStone, playerStone, depth, firstPlayerMove) => {
    if (newBoard.flat().every(cell => cell === 0)) {
      return [CENTER, CENTER];
    }
    if (firstPlayerMove && newBoard.flat().filter(cell => cell !== 0).length === 1) {
      const adjacent = getAdjacentEmpty(newBoard, firstPlayerMove[0], firstPlayerMove[1]);
      return adjacent || [CENTER, CENTER];
    }
    
    let move = null;
    
    // AI 모델 모드 처리
    if (difficulty.label === 'AI 모델') {
      try {
        // 유효한 수들 찾기
        const validMoves = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
          for (let x = 0; x < BOARD_SIZE; x++) {
            if (newBoard[y][x] === 0) {
              validMoves.push([y, x]);
            }
          }
        }
        
        if (validMoves.length > 0) {
          move = aiModelLoader.getBestMove(newBoard, aiStone, validMoves);
        }
      } catch (error) {
        console.error('AI 모델 사용 실패, 기본 AI로 대체:', error);
        // AI 모델 실패 시 기본 MCTS 사용
        move = mcts(newBoard, 150, playerStone, aiStone);
      }
    } else if (difficulty.label === 'TITIBO 모드') {
      // TITIBO 모드: MCTS + 미니맥스 조합 (300회 시뮬레이션)
      move = mcts(newBoard, 300, playerStone, aiStone);
      if (!move) {
        const [, minimaxMove] = minimax(newBoard, depth, -Infinity, Infinity, true, aiStone, playerStone);
        move = minimaxMove;
      }
    } else if (difficulty.label === 'TINI 모드') {
      // TINI 모드: MCTS (200회 시뮬레이션)
      move = mcts(newBoard, 200, playerStone, aiStone);
    } else if (difficulty.label === 'Hard') {
      // Hard 모드: MCTS (150회 시뮬레이션)
      move = mcts(newBoard, 150, playerStone, aiStone);
    } else {
      // Easy/Normal 모드: 미니맥스 (빠름)
      const [, minimaxMove] = minimax(newBoard, depth, -Infinity, Infinity, true, aiStone, playerStone);
      move = minimaxMove;
    }
    
    if (!move) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (newBoard[y][x] === 0) return [y, x];
        }
      }
      return [CENTER, CENTER];
    }
    
    const [evalScore] = minimax(newBoard, depth, -Infinity, Infinity, true, aiStone, playerStone);
    if (evalScore < -50000) {
      return null;
    }
    
    return move;
  }, [difficulty.label]);

  // 최적화된 SVG 좌표 계산 및 착수 처리
  const handleBoardClick = useCallback((e) => {
    if (winner || aiThinking || turn !== playerStone) return;
    
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
    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    // 좌표를 보드 인덱스로 변환
    const boardX = Math.round(x / CELL_SIZE);
    const boardY = Math.round(y / CELL_SIZE);
    
    // 유효한 범위인지 확인
    if (boardX < 0 || boardX >= BOARD_SIZE || boardY < 0 || boardY >= BOARD_SIZE) return;
    
    // 이미 돌이 놓인 위치인지 확인
    if (board[boardY][boardX] !== 0) return;
    
    // 금수 확인
    if (checkDoubleOpenThree(board, boardY, boardX, playerStone)) {
      alert('3-3 금수입니다! 다른 위치에 두세요.');
      return;
    }
    
    if (checkDoubleOpenFour(board, boardY, boardX, playerStone)) {
      alert('4-4 금수입니다! 다른 위치에 두세요.');
      return;
    }
    
    if (checkOverline(board, boardY, boardX, playerStone)) {
      alert('6목 이상 장목입니다! 다른 위치에 두세요.');
      return;
    }
    
    // 돌 놓기
    const newBoard = board.map(row => row.slice());
    newBoard[boardY][boardX] = playerStone;
    setLastMove([boardY, boardX]);
    setFirstPlayerMove(firstPlayerMove === null ? [boardY, boardX] : firstPlayerMove);
    setPendingMove(null);
    setMoveCount(prev => prev + 1);
    
    const win = checkWinner(newBoard);
    setBoard(newBoard);
    
    if (win) {
      setWinner(win);
    } else {
      setTurn(aiStone);
      setAiThinking(true);
      setTimeout(() => {
        const aiYX = aiMove(newBoard, aiStone, playerStone, difficulty.depth, firstPlayerMove === null ? [boardY, boardX] : firstPlayerMove);
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
        } else {
          // AI 기권
          setAiResigned(true);
          setWinner(playerStone);
        }
        setAiThinking(false);
      }, 10);
    }
  }, [board, turn, playerStone, winner, aiThinking, firstPlayerMove, aiMove, difficulty.depth, aiStone, setTurn, setWinner, setBoard, setLastMove, setFirstPlayerMove, setPendingMove, setAiResigned, checkDoubleOpenThree, checkDoubleOpenFour, checkOverline]);

  // 확인 버튼 클릭 핸들러
  const handleConfirmButtonClick = useCallback(() => {
    if (!pendingMove || winner || aiThinking || turn !== playerStone) return;
    const [y, x] = pendingMove;
    if (board[y][x] !== 0) return;
    
    // 금수 확인
    if (checkDoubleOpenThree(board, y, x, playerStone)) {
      alert('3-3 금수입니다! 다른 위치에 두세요.');
      return;
    }
    
    if (checkDoubleOpenFour(board, y, x, playerStone)) {
      alert('4-4 금수입니다! 다른 위치에 두세요.');
      return;
    }
    
    if (checkOverline(board, y, x, playerStone)) {
      alert('6목 이상 장목입니다! 다른 위치에 두세요.');
      return;
    }
    
    // 돌 놓기
    const newBoard = board.map(row => row.slice());
    newBoard[y][x] = playerStone;
    setLastMove([y, x]);
    setFirstPlayerMove(firstPlayerMove === null ? [y, x] : firstPlayerMove);
    setPendingMove(null);
    setMoveCount(prev => prev + 1);
    
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
        } else {
          // AI 기권
          setAiResigned(true);
          setWinner(playerStone);
        }
        setAiThinking(false);
      }, 10);
    }
  }, [pendingMove, board, turn, playerStone, winner, aiThinking, firstPlayerMove, aiMove, difficulty.depth, aiStone, setTurn, setWinner, setBoard, setLastMove, setFirstPlayerMove, setPendingMove, setAiResigned, checkDoubleOpenThree, checkDoubleOpenFour, checkOverline]);

  // 키보드 이동 핸들러를 useCallback으로 선언
  const handleKeyDown = useCallback((e) => {
    if (!pendingMove || winner || aiThinking || turn !== playerStone) return;
    let [y, x] = pendingMove;
    if (e.key === 'ArrowUp') y = Math.max(0, y - 1);
    if (e.key === 'ArrowDown') y = Math.min(BOARD_SIZE - 1, y + 1);
    if (e.key === 'ArrowLeft') x = Math.max(0, x - 1);
    if (e.key === 'ArrowRight') x = Math.min(BOARD_SIZE - 1, x + 1);
    if (e.key === 'Enter') {
      // 현재 pendingMove 위치에 돌 놓기
      if (board[y][x] !== 0) return;
      
      // 금수 확인
      if (checkDoubleOpenThree(board, y, x, playerStone)) {
        alert('3-3 금수입니다! 다른 위치에 두세요.');
        return;
      }
      
      if (checkDoubleOpenFour(board, y, x, playerStone)) {
        alert('4-4 금수입니다! 다른 위치에 두세요.');
        return;
      }
      
      if (checkOverline(board, y, x, playerStone)) {
        alert('6목 이상 장목입니다! 다른 위치에 두세요.');
        return;
      }
      
      // 돌 놓기
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
          } else {
            // AI 기권
            setAiResigned(true);
            setWinner(playerStone);
          }
          setAiThinking(false);
        }, 10);
      }
      return;
    }
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
      setPendingMove([y, x]);
    }
  }, [pendingMove, board, turn, playerStone, winner, aiThinking, firstPlayerMove, aiMove, difficulty.depth, aiStone, setTurn, setWinner, setBoard, setLastMove, setFirstPlayerMove, setPendingMove, setAiResigned, checkDoubleOpenThree, checkDoubleOpenFour, checkOverline]);

  // 최적화된 키보드 이벤트 핸들러
  useEffect(() => {
    if (winner || selecting || selectingDifficulty || aiThinking) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [winner, selecting, selectingDifficulty, aiThinking, handleKeyDown]);

  // 최적화된 재시작 함수
  const handleRestart = useCallback(() => {
    setBoard(createEmptyBoard());
    setTurn(1);
    setWinner(0);
    setLastMove(null);
    setSelecting(true);
    setSelectingDifficulty(false);
    setFirstPlayerMove(null);
    setAiThinking(false);
    setPendingMove(null);
    setForbiddenMoves([]);
    setMoveCount(0);
    setAiResigned(false);
    
    // MCTS 트리 캐시 초기화 (메모리 관리)
    globalMCTSTree = null;
  }, []);

  // 최적화된 돌 선택 함수
  const handleSelectStone = useCallback((stone) => {
    setPlayerStone(stone);
    setAiStone(stone === 1 ? 2 : 1);
    setSelecting(false);
    setSelectingDifficulty(true);
    setFirstPlayerMove(null);
  }, []);

  // 최적화된 난이도 선택 함수
  const handleSelectDifficulty = useCallback(async (level) => {
    setDifficulty(level);
    
    // AI 모델 모드 선택 시 모델 로드
    if (level.label === 'AI 모델') {
      setAiModelLoading(true);
      try {
        await aiModelLoader.loadModel();
        setAiModelLoaded(true);
        console.log('AI 모델 로드 완료');
      } catch (error) {
        console.error('AI 모델 로드 실패:', error);
        alert('AI 모델 로드에 실패했습니다. 다른 난이도를 선택해주세요.');
        setAiModelLoading(false);
        return;
      } finally {
        setAiModelLoading(false);
      }
    }
    
    setSelectingDifficulty(false);
    
    if (playerStone === 2) {
      const newBoard = createEmptyBoard();
      newBoard[CENTER][CENTER] = 1;
      setBoard(newBoard);
      setLastMove([CENTER, CENTER]);
      setTurn(2);
      setFirstPlayerMove(null);
      setPendingMove([CENTER, CENTER]);
    } else {
      setPendingMove([CENTER, CENTER]);
    }
  }, [playerStone]);

  // 메모이제이션된 스타일 객체들
  const boardContainerStyle = useMemo(() => ({
    display: 'inline-block',
    background: '#deb887',
    padding: IS_MOBILE ? 10 : 20,
    borderRadius: 10,
    boxShadow: '0 0 10px #aaa',
    maxWidth: '100vw',
    overflowX: 'auto',
    touchAction: 'manipulation',
    ...(IS_MOBILE && { 
      height: 'fit-content',
      margin: '10px auto',
      paddingBottom: 5
    }),
  }), []);

  const svgStyle = useMemo(() => ({
    background: '#deb887',
    cursor: winner ? 'default' : 'pointer',
    minWidth: 320,
    maxWidth: 700,
    width: '100vw',
    height: BOARD_PIXEL + 1,
    display: 'block',
    ...(IS_MOBILE && {
      maxWidth: '90vw',
      width: '90vw',
    }),
  }), [winner]);

  // 메모이제이션된 격자 렌더링
  const gridLines = useMemo(() => 
    Array.from({ length: BOARD_SIZE }).map((_, i) => (
      <g key={i}>
        <line
          x1={i * CELL_SIZE}
          y1={0}
          x2={i * CELL_SIZE}
          y2={BOARD_PIXEL}
          stroke="#333"
          strokeWidth={1}
        />
        <line
          x1={0}
          y1={i * CELL_SIZE}
          x2={BOARD_PIXEL}
          y2={i * CELL_SIZE}
          stroke="#333"
          strokeWidth={1}
        />
      </g>
    )), []);

  // 메모이제이션된 돌 렌더링
  const stones = useMemo(() => 
    board.map((row, y) =>
      row.map((cell, x) =>
        cell !== 0 ? (
          <circle
            key={`stone-${x}-${y}`}
            cx={x * CELL_SIZE}
            cy={y * CELL_SIZE}
            r={STONE_RADIUS}
            fill={cell === 1 ? '#222' : '#fff'}
            stroke={lastMove && lastMove[0] === y && lastMove[1] === x ? 'red' : cell === 2 ? '#aaa' : 'none'}
            strokeWidth={lastMove && lastMove[0] === y && lastMove[1] === x ? 3 : 2}
          />
        ) : null
      )
    ), [board, lastMove]);

  // 메모이제이션된 금수 표시
  const forbiddenMarks = useMemo(() => 
    forbiddenMoves.map(([fy, fx, type]) => (
      <g key={`forbidden-${fy}-${fx}`}>
        <line
          x1={fx * CELL_SIZE - 8}
          y1={fy * CELL_SIZE - 8}
          x2={fx * CELL_SIZE + 8}
          y2={fy * CELL_SIZE + 8}
          stroke={type === '3-3' ? 'red' : type === '4-4' ? 'orange' : 'purple'}
          strokeWidth={2}
        />
        <line
          x1={fx * CELL_SIZE + 8}
          y1={fy * CELL_SIZE - 8}
          x2={fx * CELL_SIZE - 8}
          y2={fy * CELL_SIZE + 8}
          stroke={type === '3-3' ? 'red' : type === '4-4' ? 'orange' : 'purple'}
          strokeWidth={2}
        />
      </g>
    )), [forbiddenMoves]);

  // 메모이제이션된 임시 돌 표시
  const pendingStone = useMemo(() => 
    pendingMove && !winner && !aiThinking ? (
      <circle
        cx={pendingMove[1] * CELL_SIZE}
        cy={pendingMove[0] * CELL_SIZE}
        r={STONE_RADIUS - 2}
        fill="rgba(255, 0, 0, 0.3)"
        stroke="red"
        strokeWidth={1}
      />
    ) : null, [pendingMove, winner, aiThinking]);

  return (
    <div className="game-container" style={{ textAlign: 'center', marginTop: IS_MOBILE ? 5 : 30 }}>
      <h2 style={{ fontSize: IS_MOBILE ? '18px' : '24px', margin: IS_MOBILE ? '2px 0' : '20px 0' }}>오목 게임 (React)</h2>
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
        <div style={{ margin: IS_MOBILE ? '10px auto' : '60px auto', display: 'inline-block', background: '#deb887', padding: IS_MOBILE ? 15 : 40, borderRadius: 10 }}>
          <div style={{ fontSize: IS_MOBILE ? 16 : 28, marginBottom: IS_MOBILE ? 10 : 30 }}>돌을 선택하세요</div>
          <button
            onClick={() => handleSelectStone(1)}
            style={{
              width: IS_MOBILE ? 50 : 80, height: IS_MOBILE ? 50 : 80, marginRight: IS_MOBILE ? 10 : 30, fontSize: IS_MOBILE ? 14 : 22, borderRadius: 10, border: '2px solid #222', background: '#222', color: '#fff', cursor: 'pointer'
            }}
          >
            흑
          </button>
          <button
            onClick={() => handleSelectStone(2)}
            style={{
              width: IS_MOBILE ? 50 : 80, height: IS_MOBILE ? 50 : 80, fontSize: IS_MOBILE ? 14 : 22, borderRadius: 10, border: '2px solid #aaa', background: '#fff', color: '#222', cursor: 'pointer'
            }}
          >
            백
          </button>
        </div>
      ) : selectingDifficulty ? (
        <div style={{ margin: IS_MOBILE ? '10px auto' : '60px auto', display: 'inline-block', background: '#deb887', padding: IS_MOBILE ? 15 : 40, borderRadius: 10 }}>
          <div style={{ fontSize: IS_MOBILE ? 16 : 28, marginBottom: IS_MOBILE ? 10 : 30 }}>난이도를 선택하세요</div>
          {DIFFICULTY_LEVELS.map(level => (
            <button
              key={level.label}
              onClick={() => handleSelectDifficulty(level)}
              disabled={aiModelLoading && level.label === 'AI 모델'}
              style={{
                width: IS_MOBILE ? 80 : 120, 
                height: IS_MOBILE ? 35 : 60, 
                margin: IS_MOBILE ? 3 : 10, 
                fontSize: IS_MOBILE ? 10 : 22, 
                borderRadius: 10, 
                border: '2px solid #222', 
                background: aiModelLoading && level.label === 'AI 모델' ? '#ccc' : '#fff', 
                color: aiModelLoading && level.label === 'AI 모델' ? '#666' : '#222', 
                cursor: aiModelLoading && level.label === 'AI 모델' ? 'not-allowed' : 'pointer'
              }}
            >
              {level.label === 'Easy' ? 'EASY(이준희실력)' : 
               level.label === 'AI 모델' && aiModelLoading ? 'AI 모델 로딩중...' : 
               level.label}
            </button>
          ))}
          {aiModelLoading && (
            <div style={{ 
              marginTop: 10, 
              fontSize: IS_MOBILE ? 10 : 14, 
              color: '#666',
              fontStyle: 'italic'
            }}>
              AI 모델을 로딩하고 있습니다...
            </div>
          )}
        </div>
      ) : (
        <div style={boardContainerStyle}>
          {aiThinking && <div style={{ color: 'red', fontWeight: 'bold', margin: IS_MOBILE ? 2 : 10, fontSize: IS_MOBILE ? 10 : 14 }}>AI 생각 중...</div>}
          {/* 현재 수순 표시 */}
          {!selecting && !selectingDifficulty && (
            <div style={{ 
              marginBottom: IS_MOBILE ? 5 : 10, 
              fontSize: IS_MOBILE ? 12 : 16, 
              fontWeight: 'bold',
              color: '#333'
            }}>
              {moveCount}수째
            </div>
          )}
          <svg
            width={IS_MOBILE ? "85vw" : "100vw"}
            height={BOARD_PIXEL + 1}
            viewBox={`0 0 ${BOARD_PIXEL + 1} ${BOARD_PIXEL + 1}`}
            style={svgStyle}
            onClick={handleBoardClick}
            onTouchStart={handleBoardClick}
            tabIndex={0}
          >
            {gridLines}
            {stones}
            {forbiddenMarks}
            {pendingStone}
          </svg>
          {/* 확인 버튼 및 모바일 이동 버튼 */}
          {pendingMove && !winner && !aiThinking && !IS_MOBILE && (
            <button
              onClick={handleConfirmButtonClick}
              style={{ marginTop: 16, padding: '10px 30px', fontSize: 18, background: '#222', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              확인 (Enter)
            </button>
          )}
          <div style={{ marginTop: IS_MOBILE ? 3 : 20 }}>
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
                  {aiResigned 
                    ? 'AI 기권! 플레이어 승리!' 
                    : difficulty.label === 'TINI 모드' && winner === playerStone 
                    ? '티티보 우승!!' 
                    : difficulty.label === 'Easy' && winner === playerStone
                    ? '이준띠띠 DOWN!!'
                    : difficulty.label === 'TITIBO 모드' && winner === playerStone
                    ? 'TITIBO 정복!!'
                    : winner === playerStone ? '플레이어 승리!' : 'AI 승리!'}
                </h3>
              : <span style={{ fontSize: IS_MOBILE ? '10px' : '16px' }}>현재 턴: {turn === playerStone ? (playerStone === 1 ? '흑(플레이어)' : '백(플레이어)') : (aiStone === 1 ? '흑(AI)' : '백(AI)')}</span>
            }
          </div>
          <button
            onClick={handleRestart}
            onTouchStart={handleRestart}
            style={{ 
              marginTop: IS_MOBILE ? 2 : 10, 
              padding: IS_MOBILE ? '3px 10px' : '8px 20px', 
              fontSize: IS_MOBILE ? 10 : 16 
            }}
          >
            다시하기
          </button>
        </div>
      )}
    </div>
  );
} 