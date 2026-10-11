import { useEffect, useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOARD_COLS = 10;
const BOARD_ROWS = 16;

type BoardCell = string | null;

type Piece = {
  type: string;
  matrix: number[][];
  x: number;
  y: number;
  color: string;
};

type ClassicGameState = {
  board: BoardCell[][];
  current: Piece;
  next: Piece;
  score: number;
  highScore: number;
  goal: number;
  level: number;
  speed: number;
  lines: number;
  paused: boolean;
  gameOver: boolean;
};

const TETROMINOES: Record<string, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS: Record<string, string> = {
  I: '#6ee7f9',
  O: '#facc15',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
};

const DEFAULT_PIECES = Object.keys(TETROMINOES);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function createEmptyBoard(): BoardCell[][] {
  return Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );
}

function createPiece(type = DEFAULT_PIECES[Math.floor(Math.random() * DEFAULT_PIECES.length)]): Piece {
  const matrix = TETROMINOES[type].map((row) => [...row]);
  return {
    type,
    matrix,
    x: Math.floor((BOARD_COLS - matrix[0].length) / 2),
    y: 0,
    color: COLORS[type],
  };
}

function rotateMatrix(matrix: number[][]): number[][] {
  return matrix[0].map((_, index) =>
    matrix.map((row) => row[index]).reverse(),
  );
}

function collides(
  board: BoardCell[][],
  piece: Piece,
  offsetX = 0,
  offsetY = 0,
  matrix = piece.matrix,
): boolean {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) continue;

      const nextX = piece.x + col + offsetX;
      const nextY = piece.y + row + offsetY;

      if (nextX < 0 || nextX >= BOARD_COLS || nextY >= BOARD_ROWS) {
        return true;
      }

      if (nextY >= 0 && board[nextY][nextX]) {
        return true;
      }
    }
  }

  return false;
}

function mergePiece(board: BoardCell[][], piece: Piece): BoardCell[][] {
  const nextBoard = board.map((row) => [...row]);

  piece.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;

      const x = piece.x + colIndex;
      const y = piece.y + rowIndex;

      if (y >= 0 && x >= 0 && y < BOARD_ROWS && x < BOARD_COLS) {
        nextBoard[y][x] = piece.color;
      }
    });
  });

  return nextBoard;
}

function clearCompletedLines(board: BoardCell[][]): { board: BoardCell[][]; cleared: number } {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const cleared = BOARD_ROWS - remaining.length;

  while (remaining.length < BOARD_ROWS) {
    remaining.unshift(Array.from({ length: BOARD_COLS }, () => null));
  }

  return { board: remaining, cleared };
}

function getPreviewRows(piece: Piece): string[][] {
  return piece.matrix.map((row) => row.map((cell) => (cell ? piece.color : '#bde7c6')));
}

function createInitialClassicState(): ClassicGameState {
  const current = createPiece();
  const next = createPiece();
  current.x = Math.floor((BOARD_COLS - current.matrix[0].length) / 2);
  next.x = 1;
  next.y = 1;

  return {
    board: createEmptyBoard(),
    current,
    next,
    score: 0,
    highScore: 0,
    goal: 1000,
    level: 1,
    speed: 1,
    lines: 0,
    paused: false,
    gameOver: false,
  };
}

function spawnNextPiece(state: ClassicGameState): ClassicGameState {
  const nextCurrent = {
    ...state.next,
    x: Math.floor((BOARD_COLS - state.next.matrix[0].length) / 2),
    y: 0,
  };
  const nextPiece = createPiece();
  nextPiece.x = 1;
  nextPiece.y = 1;

  if (collides(state.board, nextCurrent, 0, 0, nextCurrent.matrix)) {
    return { ...state, current: nextCurrent, next: nextPiece, gameOver: true, paused: true };
  }

  return { ...state, current: nextCurrent, next: nextPiece };
}

function stepClassicGame(state: ClassicGameState): ClassicGameState {
  if (state.paused || state.gameOver) {
    return state;
  }

  if (!collides(state.board, state.current, 0, 1, state.current.matrix)) {
    return {
      ...state,
      current: { ...state.current, y: state.current.y + 1 },
    };
  }

  const mergedBoard = mergePiece(state.board, state.current);
  const result = clearCompletedLines(mergedBoard);
  const newLines = result.cleared;
  const nextScore = state.score + [0, 100, 300, 500, 800][newLines] * state.level;
  const nextLevel = Math.max(1, Math.floor((state.lines + newLines) / 10) + 1);
  const nextSpeed = Math.min(3, Math.max(1, nextLevel));

  const withStats = {
    ...state,
    board: result.board,
    score: nextScore,
    lines: state.lines + newLines,
    level: nextLevel,
    speed: nextSpeed,
    highScore: Math.max(state.highScore, nextScore),
  };

  return spawnNextPiece(withStats);
}

function moveClassicPiece(
  state: ClassicGameState,
  action: 'left' | 'right' | 'down' | 'rotate',
): ClassicGameState {
  if (state.paused || state.gameOver) {
    return state;
  }

  if (action === 'left') {
    if (!collides(state.board, state.current, -1, 0, state.current.matrix)) {
      return { ...state, current: { ...state.current, x: state.current.x - 1 } };
    }
    return state;
  }

  if (action === 'right') {
    if (!collides(state.board, state.current, 1, 0, state.current.matrix)) {
      return { ...state, current: { ...state.current, x: state.current.x + 1 } };
    }
    return state;
  }

  if (action === 'down') {
    if (!collides(state.board, state.current, 0, 1, state.current.matrix)) {
      return { ...state, current: { ...state.current, y: state.current.y + 1 }, score: state.score + 10 };
    }
    return stepClassicGame(state);
  }

  if (action === 'rotate') {
    const rotated = rotateMatrix(state.current.matrix);
    if (!collides(state.board, state.current, 0, 0, rotated)) {
      return { ...state, current: { ...state.current, matrix: rotated } };
    }

    if (!collides(state.board, state.current, -1, 0, rotated)) {
      return { ...state, current: { ...state.current, x: state.current.x - 1, matrix: rotated } };
    }

    if (!collides(state.board, state.current, 1, 0, rotated)) {
      return { ...state, current: { ...state.current, x: state.current.x + 1, matrix: rotated } };
    }
  }

  return state;
}

function toggleClassicPause(state: ClassicGameState): ClassicGameState {
  if (state.gameOver) {
    return state;
  }

  return { ...state, paused: !state.paused };
}

type Brick = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alive: boolean;
  color: string;
};

type Ball = {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
};

type Paddle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BreakerStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

type BreakerGameState = {
  ball: Ball;
  paddle: Paddle;
  bricks: Brick[];
  score: number;
  lives: number;
  status: BreakerStatus;
  level: number;
};

function createBricks(boardWidth: number, level: number): Brick[] {
  const columns = 5;
  const rows = 4 + Math.min(level - 1, 2);
  const gap = 8;
  const leftPadding = 20;
  const topPadding = 18;
  const brickWidth = (boardWidth - leftPadding * 2 - gap * (columns - 1)) / columns;
  const brickHeight = 18;
  const colors = ['#7dd3fc', '#a78bfa', '#f9a8d4', '#fbbf24', '#4ade80'];

  const bricks: Brick[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      bricks.push({
        id: row * columns + col,
        x: leftPadding + col * (brickWidth + gap),
        y: topPadding + row * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        alive: true,
        color: colors[(row + level) % colors.length],
      });
    }
  }

  return bricks;
}

function createBreakerState(
  boardWidth: number,
  boardHeight: number,
  level = 1,
  status: BreakerStatus = 'ready',
): BreakerGameState {
  const paddleWidth = 96;
  const paddleHeight = 14;
  const speedBoost = 1 + (level - 1) * 0.15;

  return {
    ball: {
      x: boardWidth / 2,
      y: boardHeight - 62,
      radius: 8,
      vx: 3.4 * speedBoost,
      vy: -4.4 * speedBoost,
    },
    paddle: {
      x: boardWidth / 2 - paddleWidth / 2,
      y: boardHeight - 26,
      width: paddleWidth,
      height: paddleHeight,
    },
    bricks: createBricks(boardWidth, level),
    score: 0,
    lives: 3,
    status,
    level,
  };
}

function moveBreakerPaddle(
  state: BreakerGameState,
  amount: number,
  boardWidth: number,
): BreakerGameState {
  if (state.status !== 'playing') {
    return state;
  }

  return {
    ...state,
    paddle: {
      ...state.paddle,
      x: clamp(state.paddle.x + amount, 0, boardWidth - state.paddle.width),
    },
  };
}

function tickBreakerGame(
  state: BreakerGameState,
  boardWidth: number,
  boardHeight: number,
): BreakerGameState {
  if (state.status !== 'playing') {
    return state;
  }

  const nextBall = { ...state.ball };
  const nextBricks = state.bricks.map((brick) => ({ ...brick }));
  const nextPaddle = { ...state.paddle };
  let nextLives = state.lives;
  let nextScore = state.score;
  let nextStatus: BreakerStatus = state.status;

  nextBall.x += nextBall.vx;
  nextBall.y += nextBall.vy;

  if (nextBall.x - nextBall.radius <= 0 || nextBall.x + nextBall.radius >= boardWidth) {
    nextBall.vx *= -1;
    nextBall.x = clamp(nextBall.x, nextBall.radius, boardWidth - nextBall.radius);
  }

  if (nextBall.y - nextBall.radius <= 0) {
    nextBall.vy *= -1;
  }

  const paddleTop = nextPaddle.y;
  const paddleBottom = nextPaddle.y + nextPaddle.height;
  const paddleLeft = nextPaddle.x;
  const paddleRight = nextPaddle.x + nextPaddle.width;
  const ballBottom = nextBall.y + nextBall.radius;
  const ballTop = nextBall.y - nextBall.radius;

  const hitPaddle =
    nextBall.vy > 0 &&
    ballBottom >= paddleTop &&
    ballTop <= paddleBottom &&
    nextBall.x >= paddleLeft &&
    nextBall.x <= paddleRight;

  if (hitPaddle) {
    const relativeImpact =
      (nextBall.x - (paddleLeft + nextPaddle.width / 2)) / (nextPaddle.width / 2);
    nextBall.vy = -Math.abs(nextBall.vy) * (1 + (state.level - 1) * 0.04);
    nextBall.vx = relativeImpact * 5.8;
    nextBall.y = paddleTop - nextBall.radius - 1;
  }

  for (const brick of nextBricks) {
    if (!brick.alive) continue;

    const brickLeft = brick.x;
    const brickRight = brick.x + brick.width;
    const brickTop = brick.y;
    const brickBottom = brick.y + brick.height;

    const intersects =
      nextBall.x + nextBall.radius > brickLeft &&
      nextBall.x - nextBall.radius < brickRight &&
      nextBall.y + nextBall.radius > brickTop &&
      nextBall.y - nextBall.radius < brickBottom;

    if (!intersects) continue;

    brick.alive = false;
    nextScore += 10 * state.level;

    const overlapLeft = nextBall.x + nextBall.radius - brickLeft;
    const overlapRight = brickRight - (nextBall.x - nextBall.radius);
    const overlapTop = nextBall.y + nextBall.radius - brickTop;
    const overlapBottom = brickBottom - (nextBall.y - nextBall.radius);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
      nextBall.vx *= -1;
    } else {
      nextBall.vy *= -1;
    }

    break;
  }

  if (ballBottom >= boardHeight) {
    nextLives -= 1;

    if (nextLives <= 0) {
      nextStatus = 'lost';
    } else {
      return {
        ...state,
        ball: {
          x: boardWidth / 2,
          y: boardHeight - 62,
          radius: 8,
          vx: 3.4 * (1 + (state.level - 1) * 0.15),
          vy: -4.4 * (1 + (state.level - 1) * 0.15),
        },
        paddle: {
          ...state.paddle,
          x: boardWidth / 2 - state.paddle.width / 2,
        },
        lives: nextLives,
      };
    }
  }

  if (nextBricks.every((brick) => !brick.alive)) {
    if (state.level >= 3) {
      nextStatus = 'won';
    } else {
      return {
        ...state,
        ball: {
          x: boardWidth / 2,
          y: boardHeight - 62,
          radius: 8,
          vx: 3.4 * (1 + state.level * 0.12),
          vy: -4.4 * (1 + state.level * 0.12),
        },
        paddle: {
          ...state.paddle,
          x: boardWidth / 2 - state.paddle.width / 2,
        },
        bricks: createBricks(boardWidth, state.level + 1),
        score: nextScore,
        level: state.level + 1,
      };
    }
  }

  return {
    ...state,
    ball: nextBall,
    paddle: nextPaddle,
    bricks: nextBricks,
    score: nextScore,
    lives: nextLives,
    status: nextStatus,
  };
}

const gameModes = ['Classic', 'Brick Breaker'] as const;
type GameMode = (typeof gameModes)[number];

export default function HomeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const consoleWidth = Math.min(screenWidth - 20, 380);
  const shellWidth = consoleWidth;
  const shellHeight = Math.min(Math.max(screenHeight * 0.82, 640), 760);
  const breakerBoardWidth = shellWidth - 82;

  const [mode, setMode] = useState<GameMode>('Classic');
  const [soundOn, setSoundOn] = useState(true);
  const [classicGame, setClassicGame] = useState<ClassicGameState>(() => createInitialClassicState());
  const [breakerGame, setBreakerGame] = useState<BreakerGameState>(() =>
    createBreakerState(breakerBoardWidth, 350, 1, 'ready'),
  );

  const boardCellSize = useMemo(
    () => Math.max(8, Math.min(17, Math.floor((shellWidth - 200) / BOARD_COLS))),
    [shellWidth],
  );

  useEffect(() => {
    if (mode !== 'Classic' || classicGame.paused || classicGame.gameOver) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setClassicGame((previous) => stepClassicGame(previous));
    }, Math.max(120, 520 - classicGame.level * 40));

    return () => clearInterval(intervalId);
  }, [classicGame.level, classicGame.paused, classicGame.gameOver, mode]);

  useEffect(() => {
    if (mode !== 'Brick Breaker' || breakerGame.status !== 'playing') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setBreakerGame((previous) => tickBreakerGame(previous, breakerBoardWidth, 350));
    }, 16);

    return () => clearInterval(intervalId);
  }, [breakerBoardWidth, breakerGame.status, mode]);

  const handleClassicAction = (action: 'left' | 'right' | 'down' | 'rotate' | 'start' | 'pause') => {
    if (action === 'start') {
      setClassicGame((previous) => ({ ...previous, paused: !previous.paused }));
      return;
    }

    if (action === 'pause') {
      setClassicGame((previous) => toggleClassicPause(previous));
      return;
    }

    setClassicGame((previous) => moveClassicPiece(previous, action));
  };

  const handleBreakerAction = (action: 'left' | 'right' | 'down' | 'rotate' | 'pause' | 'start') => {
    if (action === 'pause') {
      setBreakerGame((previous) => ({
        ...previous,
        status: previous.status === 'playing' ? 'paused' : previous.status === 'paused' ? 'playing' : previous.status,
      }));
      return;
    }

    if (action === 'start') {
      setBreakerGame((previous) => ({
        ...previous,
        status: previous.status === 'ready' || previous.status === 'lost' || previous.status === 'won' ? 'playing' : previous.status,
      }));
      return;
    }

    if (action === 'left') {
      setBreakerGame((previous) => moveBreakerPaddle(previous, -24, breakerBoardWidth));
      return;
    }

    if (action === 'right') {
      setBreakerGame((previous) => moveBreakerPaddle(previous, 24, breakerBoardWidth));
      return;
    }

    if (action === 'down') {
      setBreakerGame((previous) => ({
        ...previous,
        ball: {
          ...previous.ball,
          y: previous.ball.y + 8,
        },
      }));
      return;
    }

    if (action === 'rotate') {
      setBreakerGame((previous) => ({
        ...previous,
        status: previous.status === 'ready' ? 'playing' : previous.status,
        ball: {
          ...previous.ball,
          vy: -Math.abs(previous.ball.vy),
        },
      }));
    }
  };

  const renderClassicScreen = () => {
    const preview = getPreviewRows(classicGame.next);

    return (
      <View style={styles.screenContent}>
        <View style={styles.lcdPanel}>
          <View style={styles.boardWrap}>
            {classicGame.board.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.boardRow}>
                {row.map((cell, colIndex) => (
                  <View
                    key={`cell-${rowIndex}-${colIndex}`}
                    style={[
                      styles.boardCell,
                      {
                        width: boardCellSize,
                        height: boardCellSize,
                        backgroundColor: cell || '#bde7c6',
                        borderColor: cell ? '#0f172a' : '#8ad9a0',
                      },
                    ]}
                  />
                ))}
              </View>
            ))}

            {classicGame.current.matrix.map((row, rowIndex) =>
              row.map((cell, colIndex) => {
                if (!cell) return null;
                const x = classicGame.current.x + colIndex;
                const y = classicGame.current.y + rowIndex;
                if (y < 0 || x < 0 || y >= BOARD_ROWS || x >= BOARD_COLS) return null;

                return (
                  <View
                    key={`active-${rowIndex}-${colIndex}`}
                    style={[
                      styles.fallingCell,
                      {
                        width: boardCellSize,
                        height: boardCellSize,
                        left: x * boardCellSize + 2,
                        top: y * boardCellSize + 2,
                        backgroundColor: classicGame.current.color,
                        borderColor: '#0f172a',
                      },
                    ]}
                  />
                );
              }),
            )}
          </View>

          <View style={styles.sidePanel}>
            <Text style={styles.sideTitle}>Next</Text>
            <View style={styles.previewGrid}>
              {preview.map((row, rowIndex) => (
                <View key={`preview-row-${rowIndex}`} style={styles.previewRow}>
                  {row.map((cell, colIndex) => (
                    <View
                      key={`preview-${rowIndex}-${colIndex}`}
                      style={[
                        styles.previewCell,
                        {
                          width: 14,
                          height: 14,
                          backgroundColor: cell,
                          borderColor: cell === '#0f172a' ? '#0f172a' : '#2b4a2f',
                        },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.statsBlock}>
              <Text style={styles.statText}>Score {classicGame.score}</Text>
              <Text style={styles.statText}>High {classicGame.highScore}</Text>
              <Text style={styles.statText}>Goal {classicGame.goal}</Text>
              <Text style={styles.statText}>Lvl {classicGame.level}</Text>
              <Text style={styles.statText}>Speed {classicGame.speed}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderBreakerScreen = () => {
    const boardWidth = breakerBoardWidth;
    const boardHeight = 350;

    return (
      <View style={styles.screenContent}>
        <View style={styles.breakerViewport}>
          <View style={[styles.breakerBoard, { width: boardWidth, height: boardHeight }]}>
            {breakerGame.bricks.map((brick) =>
              brick.alive ? (
                <View
                  key={brick.id}
                  style={[
                    styles.breakerBrick,
                    {
                      left: brick.x,
                      top: brick.y,
                      width: brick.width,
                      height: brick.height,
                      backgroundColor: brick.color,
                    },
                  ]}
                />
              ) : null,
            )}

            <View
              style={[
                styles.breakerPaddle,
                {
                  left: breakerGame.paddle.x,
                  top: breakerGame.paddle.y,
                  width: breakerGame.paddle.width,
                  height: breakerGame.paddle.height,
                },
              ]}
            />

            <View
              style={[
                styles.breakerBall,
                {
                  width: breakerGame.ball.radius * 2,
                  height: breakerGame.ball.radius * 2,
                  left: breakerGame.ball.x - breakerGame.ball.radius,
                  top: breakerGame.ball.y - breakerGame.ball.radius,
                },
              ]}
            />

            {(breakerGame.status === 'ready' || breakerGame.status === 'paused' || breakerGame.status === 'won' || breakerGame.status === 'lost') && (
              <View style={styles.breakerOverlay}>
                <Text style={styles.breakerOverlayTitle}>
                  {breakerGame.status === 'ready'
                    ? 'Ready'
                    : breakerGame.status === 'paused'
                      ? 'Paused'
                      : breakerGame.status === 'won'
                        ? 'You Win'
                        : 'Game Over'}
                </Text>
                <Text style={styles.breakerOverlayText}>Score: {breakerGame.score}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.consoleShell, { width: shellWidth, height: shellHeight }]}>
        <View style={styles.topHeader}>
          <Text style={styles.topBrand}>BRICK GAME</Text>
          <Text style={styles.themeTag}>{soundOn ? 'SOUND ON' : 'SOUND OFF'}</Text>
        </View>

        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('Classic')} style={[styles.modeButton, mode === 'Classic' && styles.modeButtonActive]}>
            <Text style={styles.modeButtonText}>Classic</Text>
          </Pressable>
          <Pressable onPress={() => setMode('Brick Breaker')} style={[styles.modeButton, mode === 'Brick Breaker' && styles.modeButtonActive]}>
            <Text style={styles.modeButtonText}>Breaker</Text>
          </Pressable>
        </View>

        <View style={styles.lcdFrame}>
          {mode === 'Classic' ? renderClassicScreen() : renderBreakerScreen()}
        </View>

        <View style={styles.controlsWrap}>
          <View style={styles.mainControlsRow}>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('left') : handleBreakerAction('left'))} style={styles.yellowButton}>
              <Text style={styles.buttonGlyph}>◀</Text>
            </Pressable>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('right') : handleBreakerAction('right'))} style={styles.yellowButton}>
              <Text style={styles.buttonGlyph}>▶</Text>
            </Pressable>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('down') : handleBreakerAction('down'))} style={styles.yellowButton}>
              <Text style={styles.buttonGlyph}>▼</Text>
            </Pressable>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('rotate') : handleBreakerAction('rotate'))} style={[styles.yellowButton, styles.rotateButton]}>
              <Text style={styles.buttonGlyph}>⟳</Text>
            </Pressable>
          </View>

          <View style={styles.smallButtonRow}>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('start') : handleBreakerAction('start'))} style={styles.greenButton}>
              <Text style={styles.greenButtonText}>START</Text>
            </Pressable>
            <Pressable onPress={() => (mode === 'Classic' ? handleClassicAction('pause') : handleBreakerAction('pause'))} style={styles.greenButton}>
              <Text style={styles.greenButtonText}>PAUSE</Text>
            </Pressable>
            <Pressable onPress={() => setSoundOn((value) => !value)} style={styles.greenButton}>
              <Text style={styles.greenButtonText}>{soundOn ? 'SOUND' : 'MUTE'}</Text>
            </Pressable>
            <Pressable onPress={() => setMode((current) => (current === 'Classic' ? 'Brick Breaker' : 'Classic'))} style={styles.greenButton}>
              <Text style={styles.greenButtonText}>MODE</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>{mode}</Text>
          <Text style={styles.footerLabel}>LCD</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consoleShell: {
    backgroundColor: '#175cc5',
    borderRadius: 28,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    borderWidth: 3,
    borderColor: '#2a6fe5',
    alignItems: 'center',
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topBrand: {
    color: '#dfe9ff',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 1,
  },
  themeTag: {
    color: '#dfe9ff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    opacity: 0.8,
  },
  modeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#153b8b',
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4c8af7',
  },
  modeButtonActive: {
    backgroundColor: '#2357c7',
  },
  modeButtonText: {
    color: '#edf6ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lcdFrame: {
    width: '100%',
    flex: 1,
    backgroundColor: '#9dac8c',
    borderRadius: 16,
    padding: 10,
    borderWidth: 4,
    borderColor: '#5e6e59',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  screenContent: {
    flex: 1,
    justifyContent: 'center',
  },
  lcdPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    flex: 1,
  },
  boardWrap: {
    flex: 1,
    backgroundColor: '#bde7c6',
    borderRadius: 8,
    padding: 4,
    borderWidth: 2,
    borderColor: '#1a2d1f',
  },
  boardRow: {
    flexDirection: 'row',
  },
  boardCell: {
    borderWidth: 1,
    borderRadius: 2,
    margin: 1,
  },
  fallingCell: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 2,
  },
  sidePanel: {
    width: 92,
    backgroundColor: '#bde7c6',
    borderRadius: 8,
    padding: 6,
    borderWidth: 2,
    borderColor: '#1a2d1f',
    justifyContent: 'space-between',
  },
  sideTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 2,
  },
  previewGrid: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
  },
  previewCell: {
    borderWidth: 1,
    borderRadius: 2,
    margin: 1,
  },
  statsBlock: {
    gap: 2,
  },
  statText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
  },
  breakerViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#bde7c6',
    borderRadius: 8,
    padding: 6,
    borderWidth: 2,
    borderColor: '#1a2d1f',
  },
  breakerBoard: {
    position: 'relative',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2f3f52',
  },
  breakerBrick: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  breakerPaddle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
  },
  breakerBall: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
  breakerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakerOverlayTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  breakerOverlayText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  controlsWrap: {
    width: '100%',
    marginTop: 16,
  },
  mainControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  yellowButton: {
    width: 62,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#f4d236',
    borderWidth: 2,
    borderColor: '#efb300',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  rotateButton: {
    width: 74,
  },
  buttonGlyph: {
    color: '#153b8b',
    fontSize: 26,
    fontWeight: '900',
  },
  smallButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  greenButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#5fd36a',
    borderWidth: 2,
    borderColor: '#2f7d39',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greenButtonText: {
    color: '#0b2b12',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  footerLabel: {
    color: '#dfe9ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
