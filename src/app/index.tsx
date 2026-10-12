import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOARD_COLS = 10;
const BOARD_ROWS = 16;
const BOARD_CELL_MARGIN = 0.25;
const BOARD_CONTENT_PADDING = 2;
const BOARD_GRID_SCALE = 0.88;
const LCD_BACKGROUND = '#b8cca2';
const LCD_GRID = '#99ad83';
const LCD_BLOCK = '#18251b';
const LCD_BLOCK_EDGE = '#101a13';

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
    color: LCD_BLOCK,
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
  return piece.matrix.map((row) => row.map((cell) => (cell ? LCD_BLOCK : LCD_BACKGROUND)));
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
  const nextSpeed = Math.min(10, Math.max(1, nextLevel));

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

function dropClassicPiece(state: ClassicGameState): ClassicGameState {
  if (state.paused || state.gameOver) {
    return state;
  }

  let dropDistance = 0;
  while (!collides(state.board, state.current, 0, dropDistance + 1)) {
    dropDistance += 1;
  }

  return stepClassicGame({
    ...state,
    current: { ...state.current, y: state.current.y + dropDistance },
    score: state.score + dropDistance * 2,
  });
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
      return {
        ...state,
        current: { ...state.current, y: state.current.y + 1 },
        score: state.score + 10 * state.level,
      };
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

type GameMode = 'Classic' | 'Brick Breaker';
type SoundEffect = 'move' | 'rotate' | 'land' | 'lineClear' | 'gameOver' | 'collision' | 'victory';
type PhysicalButtonTone = 'yellow' | 'red' | 'green' | 'black' | 'muted';
type PhysicalButtonSize = 'utility' | 'direction' | 'rotate';

type PhysicalButtonProps = {
  tone: PhysicalButtonTone;
  size: PhysicalButtonSize;
  children?: ReactNode;
};

export default function HomeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const consoleWidth = Math.min(screenWidth - 32, 460);
  const shellWidth = consoleWidth;
  const shellHeight = Math.min(Math.max(screenHeight * 0.975, 540), 820);
  const breakerBoardWidth = Math.max(150, Math.floor(shellWidth * 0.55));
  const breakerBoardHeight = Math.min(300, Math.max(190, shellHeight * 0.37));

  const [mode, setMode] = useState<GameMode>('Classic');
  const [soundOn, setSoundOn] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [classicGame, setClassicGame] = useState<ClassicGameState>(() => createInitialClassicState());
  const [breakerGame, setBreakerGame] = useState<BreakerGameState>(() =>
    createBreakerState(breakerBoardWidth, breakerBoardHeight, 1, 'ready'),
  );
  const [classicBoardLayout, setClassicBoardLayout] = useState({ width: 0, height: 0 });
  const moveSound = useAudioPlayer(require('../../assets/audio/move.wav'));
  const rotateSound = useAudioPlayer(require('../../assets/audio/rotate.wav'));
  const landSound = useAudioPlayer(require('../../assets/audio/land.wav'));
  const lineClearSound = useAudioPlayer(require('../../assets/audio/lineClear.wav'));
  const gameOverSound = useAudioPlayer(require('../../assets/audio/gameOver.wav'));
  const collisionSound = useAudioPlayer(require('../../assets/audio/collision.wav'));
  const victorySound = useAudioPlayer(require('../../assets/audio/victory.wav'));
  const soundPlayers = useMemo(() => ({
    move: moveSound,
    rotate: rotateSound,
    land: landSound,
    lineClear: lineClearSound,
    gameOver: gameOverSound,
    collision: collisionSound,
    victory: victorySound,
  }), [moveSound, rotateSound, landSound, lineClearSound, gameOverSound, collisionSound, victorySound]);
  const playSound = useCallback((effect: SoundEffect) => {
    const player = soundPlayers[effect];
    if (!soundOn || !player.isLoaded) return;

    void player.seekTo(0)
      .then(() => {
        if (soundOn) player.play();
      })
      .catch((error: unknown) => console.warn('Unable to play game sound', error));
  }, [soundOn, soundPlayers]);
  const previousClassicGame = useRef(classicGame);
  const previousBreakerGame = useRef(breakerGame);

  const boardCellSize = useMemo(
    () => Math.max(8, Math.min(17, Math.floor((shellWidth * 0.9 - 140) / BOARD_COLS))),
    [shellWidth],
  );
  const boardContentWidth = classicBoardLayout.width - 2 - BOARD_CONTENT_PADDING * 2;
  const boardContentHeight = classicBoardLayout.height - 2 - BOARD_CONTENT_PADDING * 2;
  const boardCellPitchX = boardContentWidth > 0
    ? boardContentWidth * BOARD_GRID_SCALE / BOARD_COLS
    : boardCellSize + BOARD_CELL_MARGIN * 2;
  const boardCellPitchY = boardContentHeight > 0
    ? boardContentHeight * BOARD_GRID_SCALE / BOARD_ROWS
    : boardCellSize + BOARD_CELL_MARGIN * 2;
  const boardCellWidth = boardCellPitchX - BOARD_CELL_MARGIN * 2;
  const boardCellHeight = boardCellPitchY - BOARD_CELL_MARGIN * 2;
  const boardGridOffsetX = Math.max(0, boardContentWidth * (1 - BOARD_GRID_SCALE) / 2);
  const boardGridOffsetY = Math.max(0, boardContentHeight * (1 - BOARD_GRID_SCALE) / 2);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch((error: unknown) => console.warn('Unable to configure game audio', error));
  }, []);

  useEffect(() => {
    for (const player of Object.values(soundPlayers)) {
      player.muted = !soundOn;
      player.volume = 0.35;
      if (!soundOn && player.playing) player.pause();
    }
  }, [soundOn, soundPlayers]);

  useEffect(() => {
    const previous = previousClassicGame.current;
    previousClassicGame.current = classicGame;
    if (previous === classicGame) return;

    if (!previous.gameOver && classicGame.gameOver) playSound('gameOver');
    const linesCleared = classicGame.lines > previous.lines;
    if (classicGame.lines > previous.lines) {
      playSound('lineClear');
    }
    if (
      previous.board !== classicGame.board &&
      (classicGame.board.some((row) => row.some(Boolean)) || linesCleared)
    ) {
      playSound('land');
    }
  }, [classicGame, playSound]);

  useEffect(() => {
    const previous = previousBreakerGame.current;
    previousBreakerGame.current = breakerGame;
    if (previous === breakerGame) return;

    if (previous.status !== breakerGame.status) {
      if (breakerGame.status === 'won') playSound('victory');
      if (breakerGame.status === 'lost') playSound('gameOver');
      return;
    }

    if (
      previous.status === 'playing' &&
      (Math.sign(previous.ball.vx) !== Math.sign(breakerGame.ball.vx) ||
        Math.sign(previous.ball.vy) !== Math.sign(breakerGame.ball.vy))
    ) {
      playSound('collision');
    }
  }, [breakerGame, playSound]);

  useEffect(() => {
    if (mode !== 'Classic' || settingsOpen || classicGame.paused || classicGame.gameOver) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setClassicGame((previous) => stepClassicGame(previous));
    }, Math.max(90, 540 - (classicGame.level - 1) * 45));

    return () => clearInterval(intervalId);
  }, [classicGame.level, classicGame.paused, classicGame.gameOver, mode, settingsOpen]);

  useEffect(() => {
    if (mode !== 'Brick Breaker' || settingsOpen || breakerGame.status !== 'playing') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setBreakerGame((previous) =>
        tickBreakerGame(previous, breakerBoardWidth, breakerBoardHeight),
      );
    }, 16);

    return () => clearInterval(intervalId);
  }, [breakerBoardHeight, breakerBoardWidth, breakerGame.status, mode, settingsOpen]);

  const handleClassicAction = (action: 'left' | 'right' | 'down' | 'rotate' | 'start' | 'pause') => {
    if (action === 'start') {
      setClassicGame((previous) =>
        previous.gameOver
          ? { ...createInitialClassicState(), highScore: previous.highScore }
          : { ...previous, paused: false },
      );
      return;
    }

    if (action === 'pause') {
      setClassicGame((previous) => toggleClassicPause(previous));
      return;
    }

    const nextGame = moveClassicPiece(classicGame, action);
    if (nextGame !== classicGame) {
      setClassicGame(nextGame);
      if (nextGame.board === classicGame.board) {
        playSound(action === 'rotate' ? 'rotate' : 'move');
      }
    }
  };

  const handleClassicDrop = () => {
    setClassicGame((previous) => dropClassicPiece(previous));
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
      setBreakerGame((previous) => {
        if (previous.status === 'lost' || previous.status === 'won') {
          return createBreakerState(breakerBoardWidth, breakerBoardHeight, 1, 'playing');
        }

        return {
          ...previous,
          status: previous.status === 'ready' || previous.status === 'paused'
            ? 'playing'
            : previous.status,
        };
      });
      return;
    }

    if (action === 'left') {
      setBreakerGame((previous) => moveBreakerPaddle(previous, -36, breakerBoardWidth));
      return;
    }

    if (action === 'right') {
      setBreakerGame((previous) => moveBreakerPaddle(previous, 36, breakerBoardWidth));
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

  const resetActiveGame = () => {
    if (mode === 'Classic') {
      setClassicGame((previous) => ({
        ...createInitialClassicState(),
        highScore: previous.highScore,
      }));
      return;
    }

    setBreakerGame(createBreakerState(breakerBoardWidth, breakerBoardHeight, 1, 'ready'));
  };

  const renderClassicScreen = () => {
    const preview = getPreviewRows(classicGame.next);

    return (
      <View style={styles.screenContent}>
        <View style={styles.lcdPanel}>
          <View
            testID="classic-board"
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setClassicBoardLayout((previous) =>
                previous.width === width && previous.height === height
                  ? previous
                  : { width, height },
              );
            }}
            style={styles.boardWrap}>
            {classicGame.board.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.boardRow}>
                {row.map((cell, colIndex) => (
                  <View
                    testID={`board-cell-${rowIndex}-${colIndex}`}
                    key={`cell-${rowIndex}-${colIndex}`}
                    style={[
                      styles.boardCell,
                      {
                        width: boardCellWidth,
                        height: boardCellHeight,
                        backgroundColor: cell ? LCD_BLOCK : LCD_BACKGROUND,
                        borderColor: cell ? LCD_BLOCK_EDGE : LCD_GRID,
                      },
                    ]}>
                    {cell ? <View style={styles.blockInset} /> : null}
                  </View>
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
                    testID={`falling-cell-${y}-${x}`}
                    key={`active-${rowIndex}-${colIndex}`}
                    style={[
                      styles.fallingCell,
                      {
                        width: boardCellWidth,
                        height: boardCellHeight,
                        left: x * boardCellPitchX + BOARD_CONTENT_PADDING + BOARD_CELL_MARGIN + boardGridOffsetX,
                        top: y * boardCellPitchY + BOARD_CONTENT_PADDING + BOARD_CELL_MARGIN + boardGridOffsetY,
                        backgroundColor: LCD_BLOCK,
                        borderColor: LCD_BLOCK_EDGE,
                      },
                    ]}
                  >
                    <View style={styles.blockInset} />
                  </View>
                );
              }),
            )}

            {(classicGame.paused || classicGame.gameOver) && (
              <View style={styles.classicOverlay}>
                <Text style={styles.classicOverlayTitle}>
                  {classicGame.gameOver ? 'GAME OVER' : 'PAUSED'}
                </Text>
                <Text style={styles.classicOverlayText}>SCORE {classicGame.score}</Text>
                <Text style={styles.classicOverlayText}>PRESS RESET TO PLAY</Text>
              </View>
            )}
          </View>

          <View style={styles.sidePanel}>
            <View style={styles.statsBlock}>
              <Text style={styles.statLabel}>SCORE</Text>
              <Text style={styles.statValue}>{String(classicGame.score).padStart(6, '0')}</Text>
              <Text style={styles.statLabel}>LEVEL</Text>
              <Text style={styles.statValue}>{String(classicGame.level).padStart(2, '0')}</Text>
              <Text style={styles.statLabel}>SPEED</Text>
              <Text style={styles.statSmall}>{classicGame.speed}</Text>
              <Text style={styles.statLabel}>HIGH</Text>
              <Text style={styles.statSmall}>{classicGame.highScore}</Text>
              <Text style={styles.statLabel}>GOAL</Text>
              <Text style={styles.statSmall}>{classicGame.goal}</Text>
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.sideTitle}>NEXT</Text>
              <View style={styles.previewGrid}>
                {preview.map((row, rowIndex) => (
                  <View key={`preview-row-${rowIndex}`} style={styles.previewRow}>
                    {row.map((cell, colIndex) => (
                      <View
                        key={`preview-${rowIndex}-${colIndex}`}
                        style={[
                          styles.previewCell,
                          {
                            width: 7,
                            height: 7,
                            backgroundColor: cell,
                            borderColor: cell === LCD_BLOCK ? LCD_BLOCK_EDGE : LCD_GRID,
                          },
                        ]}>
                        {cell === LCD_BLOCK ? <View style={styles.previewBlockInset} /> : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderBreakerScreen = () => {
    const boardWidth = breakerBoardWidth;
    const boardHeight = breakerBoardHeight;

    return (
      <View style={styles.screenContent}>
        <View style={styles.breakerPanel}>
          <View style={styles.breakerViewport}>
            <View
              testID="breaker-board"
              style={[styles.breakerBoard, { width: boardWidth, height: boardHeight }]}>
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
                testID="breaker-paddle"
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

          <View style={styles.breakerStatsPanel}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Text testID="breaker-score" style={styles.statValue}>
              {String(breakerGame.score).padStart(6, '0')}
            </Text>
            <Text style={styles.statLabel}>LEVEL</Text>
            <Text style={styles.statValue}>{String(breakerGame.level).padStart(2, '0')}</Text>
            <Text style={styles.statLabel}>LIVES</Text>
            <Text testID="breaker-lives" style={styles.statValue}>
              {String(breakerGame.lives).padStart(2, '0')}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.consoleShell, { width: shellWidth, height: shellHeight }]}>
        <View style={styles.topHeader}>
          <View style={styles.brandLine} />
          <Text style={styles.topBrand}>BRICK GAME</Text>
          <View style={styles.brandLine} />
        </View>

        <View style={[styles.displayHousing, { height: shellHeight * 0.43 }]}>
          <View style={styles.decorColumn}>
            {Array.from({ length: 6 }, (_, index) => (
              <View key={`left-decor-${index}`} style={styles.decorCluster}>
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
              </View>
            ))}
          </View>

          <View style={styles.displayCenter}>
            <View style={styles.screenMolding}>
              <View style={styles.lcdFrame}>
                {mode === 'Classic' ? renderClassicScreen() : renderBreakerScreen()}
                {settingsOpen && (
                  <View style={styles.settingsOverlay}>
                    <Text style={styles.settingsTitle}>SETTINGS</Text>
                    <Text style={styles.settingsLabel}>SOUND EFFECTS</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={soundOn ? 'Turn sound off' : 'Turn sound on'}
                      onPress={() => setSoundOn((value) => !value)}
                      style={styles.settingsAction}>
                      <Text style={styles.settingsActionText}>{soundOn ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close settings"
                      onPress={() => setSettingsOpen(false)}
                      style={styles.settingsAction}>
                      <Text style={styles.settingsActionText}>DONE</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.decorColumn}>
            {Array.from({ length: 6 }, (_, index) => (
              <View key={`right-decor-${index}`} style={styles.decorCluster}>
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
                <View style={styles.decorTile} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bodyGap}>
          <View style={styles.bodyMound}>
            <View style={styles.bodyMoundHighlight} />
            <View style={styles.bodyMoundLowerEdge} />
            <View style={styles.bodyMoundCenterGlow} />
          </View>
        </View>

        <View style={styles.utilityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset game"
            onPress={resetActiveGame}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.buttonPressed]}>
            <PhysicalButton tone="red" size="utility" />
            <Text style={styles.utilityText}>RESET</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.buttonPressed]}>
            <PhysicalButton tone="black" size="utility" />
            <Text style={styles.utilityText}>SETTINGS</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={soundOn ? 'Mute sound' : 'Enable sound'}
            onPress={() => setSoundOn((value) => !value)}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.buttonPressed]}>
            <PhysicalButton tone={soundOn ? 'green' : 'muted'} size="utility" />
            <Text style={styles.utilityText}>SOUND</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pause or resume game"
            onPress={() => (mode === 'Classic'
              ? handleClassicAction('pause')
              : handleBreakerAction(breakerGame.status === 'ready' ? 'start' : 'pause'))}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.buttonPressed]}>
            <PhysicalButton tone="green" size="utility" />
            <Text style={styles.utilityText}>PAUSE</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch game mode"
            onPress={() => setMode((current) => current === 'Classic' ? 'Brick Breaker' : 'Classic')}
            style={({ pressed }) => [styles.utilityButton, pressed && styles.buttonPressed]}>
            <PhysicalButton tone="green" size="utility" />
            <Text style={styles.utilityText}>OPTIONS</Text>
          </Pressable>
        </View>

        <View style={styles.gameControlsRow}>
          <View style={styles.directionPad}>
            <View style={styles.padRow}>
              <View style={styles.padSpacer} />
              <View style={styles.padControl}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Drop piece"
                  onPress={() => mode === 'Classic'
                    ? handleClassicDrop()
                    : handleBreakerAction('start')}
                  style={({ pressed }) => [styles.padButton, pressed && styles.buttonPressed]}>
                  <PhysicalButton tone="yellow" size="direction" />
                </Pressable>
                <Text style={styles.padLabel}>QUICK DOWN</Text>
              </View>
              <View style={styles.padSpacer} />
            </View>
            <View style={styles.padRow}>
              <View style={styles.padControl}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move left"
                  onPress={() => (mode === 'Classic' ? handleClassicAction('left') : handleBreakerAction('left'))}
                  style={({ pressed }) => [styles.padButton, pressed && styles.buttonPressed]}>
                  <PhysicalButton tone="yellow" size="direction" />
                </Pressable>
                <Text style={styles.padLabel}>LEFT SPEED-</Text>
              </View>
              <View style={styles.padHub}>
                <Text style={styles.padHubGlyph}>✥</Text>
              </View>
              <View style={styles.padControl}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move right"
                  onPress={() => (mode === 'Classic' ? handleClassicAction('right') : handleBreakerAction('right'))}
                  style={({ pressed }) => [styles.padButton, pressed && styles.buttonPressed]}>
                  <PhysicalButton tone="yellow" size="direction" />
                </Pressable>
                <Text style={styles.padLabel}>RIGHT SPEED+</Text>
              </View>
            </View>
            <View style={styles.padRow}>
              <View style={styles.padSpacer} />
              <View style={styles.padControl}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move down"
                  onPress={() => (mode === 'Classic' ? handleClassicAction('down') : handleBreakerAction('down'))}
                  style={({ pressed }) => [styles.padButton, pressed && styles.buttonPressed]}>
                  <PhysicalButton tone="yellow" size="direction" />
                </Pressable>
                <Text style={styles.padLabel}>DOWN LEVEL+</Text>
              </View>
              <View style={styles.padSpacer} />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Rotate"
            onPress={() => (mode === 'Classic' ? handleClassicAction('rotate') : handleBreakerAction('rotate'))}
            style={({ pressed }) => [styles.rotateControl, pressed && styles.buttonPressed]}>
            <PhysicalButton tone="yellow" size="rotate" />
            <Text style={styles.controlLabel}>ROTATE</Text>
          </Pressable>
        </View>

        <View style={styles.brandSpacer} />

        <View style={styles.logoArea}>
          <Text style={styles.logoText}>BRICK GAME</Text>
          <View style={styles.modelRow}>
            <View style={styles.modelLine} />
            <Text style={styles.modelCode}>E-9999</Text>
            <View style={styles.modelLine} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eaf4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consoleShell: {
    backgroundColor: '#168bb5',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#063c52',
    shadowOpacity: 0.58,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
    borderWidth: 4,
    borderTopColor: '#a4f1ff',
    borderLeftColor: '#68d8f0',
    borderRightColor: '#08749d',
    borderBottomColor: '#07506f',
    alignItems: 'center',
  },
  topHeader: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
    marginBottom: 5,
  },
  brandLine: {
    flex: 1,
    height: 5,
    backgroundColor: '#123443',
    marginHorizontal: 10,
    borderRadius: 3,
  },
  topBrand: {
    color: '#123443',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  modelTag: {
    position: 'absolute',
    right: 3,
    color: '#dfe9ff',
    fontSize: 7,
    fontWeight: '700',
  },
  displayHousing: {
    width: '100%',
    height: '43%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  decorColumn: {
    width: 13,
    height: '82%',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  decorCluster: {
    width: 16,
    height: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    gap: 1,
  },
  decorTile: {
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: '#9bc8ff',
    backgroundColor: '#1765ce',
  },
  displayCenter: {
    width: '92%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenMolding: {
    width: '100%',
    flex: 1,
    padding: 7,
    borderRadius: 14,
    backgroundColor: '#092b3a',
    borderWidth: 4,
    borderTopColor: '#a2f3ff',
    borderLeftColor: '#48c8e2',
    borderRightColor: '#062432',
    borderBottomColor: '#031923',
    shadowColor: '#032b3b',
    shadowOpacity: 0.72,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modeRow: {
    width: '100%',
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#126f94',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#80e7f5',
  },
  modeButtonActive: {
    backgroundColor: '#103e62',
    borderColor: '#f2fcff',
  },
  modeButtonText: {
    color: '#f2fcff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  lcdFrame: {
    position: 'relative',
    width: '100%',
    flex: 1,
    backgroundColor: '#071d27',
    borderRadius: 7,
    padding: 6,
    borderWidth: 3,
    borderTopColor: '#1d5364',
    borderLeftColor: '#164354',
    borderRightColor: '#04151d',
    borderBottomColor: '#020d13',
    shadowColor: '#020e14',
    shadowOpacity: 0.62,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  screenContent: {
    flex: 1,
    justifyContent: 'center',
  },
  lcdPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    flex: 1,
  },
  boardWrap: {
    position: 'relative',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LCD_BACKGROUND,
    borderRadius: 2,
    padding: 2,
    borderWidth: 1,
    borderColor: '#1a2d1f',
  },
  boardRow: {
    flexDirection: 'row',
  },
  boardCell: {
    borderWidth: 0.5,
    borderRadius: 1,
    margin: BOARD_CELL_MARGIN,
  },
  blockInset: {
    flex: 1,
    margin: 2,
    backgroundColor: '#95a986',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: '#becbaa',
    borderLeftColor: '#aab99a',
    borderRightColor: '#334a34',
    borderBottomColor: '#263b2b',
  },
  previewBlockInset: {
    flex: 1,
    margin: 1,
    backgroundColor: '#95a986',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#becbaa',
    borderLeftColor: '#aab99a',
    borderRightColor: '#334a34',
    borderBottomColor: '#263b2b',
  },
  fallingCell: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 2,
  },
  sidePanel: {
    width: 68,
    backgroundColor: LCD_BACKGROUND,
    borderRadius: 2,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1a2d1f',
    justifyContent: 'space-between',
  },
  sideTitle: {
    color: '#0f172a',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 1,
  },
  previewGrid: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
  },
  previewCell: {
    borderWidth: 1,
    borderRadius: 1,
    margin: 0.5,
  },
  statsBlock: {
    gap: 2,
  },
  previewSection: {
    alignItems: 'center',
  },
  statLabel: {
    color: LCD_BLOCK_EDGE,
    fontSize: 9,
    fontWeight: '900',
  },
  statValue: {
    color: '#0f172a',
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '900',
  },
  statSmall: {
    color: LCD_BLOCK_EDGE,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  breakerViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LCD_BACKGROUND,
    borderRadius: 2,
  },
  breakerPanel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  breakerStatsPanel: {
    width: 62,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    backgroundColor: LCD_BACKGROUND,
    borderWidth: 1,
    borderColor: '#1a2d1f',
  },
  breakerBoard: {
    position: 'relative',
    backgroundColor: '#17233b',
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#315b3b',
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
  classicOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    backgroundColor: 'rgba(184, 204, 162, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classicOverlayTitle: {
    color: LCD_BLOCK_EDGE,
    fontSize: 12,
    fontWeight: '900',
  },
  classicOverlayText: {
    color: LCD_BLOCK_EDGE,
    fontSize: 8,
    fontWeight: '800',
    marginTop: 3,
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(184,204,162,0.97)',
  },
  settingsTitle: {
    color: LCD_BLOCK_EDGE,
    fontSize: 14,
    fontWeight: '900',
  },
  settingsLabel: {
    color: LCD_BLOCK_EDGE,
    fontSize: 9,
    fontWeight: '800',
  },
  settingsAction: {
    width: '72%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: LCD_BLOCK_EDGE,
    backgroundColor: '#8fa27e',
  },
  settingsActionText: {
    color: LCD_BLOCK_EDGE,
    fontSize: 9,
    fontWeight: '900',
  },
  bodyGap: {
    width: '100%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  bodyMound: {
    width: '58%',
    height: 28,
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#176d99',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: '#8edcf2',
    borderLeftColor: '#4eabc9',
    borderRightColor: '#0d587d',
    shadowColor: '#061e35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  bodyMoundHighlight: {
    position: 'absolute',
    top: 1,
    left: '12%',
    right: '12%',
    height: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(151, 222, 245, 0.55)',
  },
  bodyMoundCenterGlow: {
    position: 'absolute',
    top: 5,
    left: '25%',
    right: '25%',
    height: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(66, 158, 197, 0.35)',
  },
  bodyMoundLowerEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(4, 48, 78, 0.45)',
  },
  utilityRow: {
    width: '68%',
    alignSelf: 'flex-end',
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  utilityButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    transform: [{ translateY: 3 }],
    opacity: 0.96,
  },
  physicalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
    padding: 3,
    shadowColor: '#052d3c',
    shadowOpacity: 0.62,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  physicalButtonUtility: {
    width: 36,
    height: 36,
  },
  physicalButtonDirection: {
    width: 62,
    height: 62,
  },
  physicalButtonRotate: {
    width: 102,
    height: 102,
  },
  physicalRimYellow: {
    backgroundColor: '#a86e08',
    borderColor: '#865606',
  },
  physicalRimRed: {
    backgroundColor: '#a20d28',
    borderColor: '#79081d',
  },
  physicalRimGreen: {
    backgroundColor: '#08752c',
    borderColor: '#075b24',
  },
  physicalRimBlack: {
    backgroundColor: '#05090c',
    borderColor: '#020406',
  },
  physicalRimMuted: {
    backgroundColor: '#687681',
    borderColor: '#4a5963',
  },
  physicalFace: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 999,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 7,
    borderLeftWidth: 3,
  },
  physicalFaceYellow: {
    backgroundColor: '#ffd52d',
    borderTopColor: '#ffe36a',
    borderRightColor: '#e9a911',
    borderBottomColor: '#c78000',
    borderLeftColor: '#f6ca37',
  },
  physicalFaceRed: {
    backgroundColor: '#f5213b',
    borderTopColor: '#ff6678',
    borderRightColor: '#ce172e',
    borderBottomColor: '#a30c20',
    borderLeftColor: '#ed354c',
  },
  physicalFaceGreen: {
    backgroundColor: '#20df58',
    borderTopColor: '#59ed7b',
    borderRightColor: '#13ad42',
    borderBottomColor: '#087d2d',
    borderLeftColor: '#31d85f',
  },
  physicalFaceBlack: {
    backgroundColor: '#171d22',
    borderTopColor: '#34515f',
    borderRightColor: '#11161a',
    borderBottomColor: '#030608',
    borderLeftColor: '#263f4d',
  },
  physicalFaceMuted: {
    backgroundColor: '#c4cbd5',
    borderTopColor: '#f1f5f8',
    borderRightColor: '#a1abb5',
    borderBottomColor: '#687581',
    borderLeftColor: '#dbe1e7',
  },
  physicalContent: {
    zIndex: 1,
  },
  utilityText: {
    color: '#e4efff',
    fontSize: 8,
    fontWeight: '900',
    marginTop: 4,
  },
  gameControlsRow: {
    width: '100%',
    height: 214,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  directionPad: {
    width: 204,
    height: 192,
    justifyContent: 'space-between',
  },
  padRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 62,
  },
  padControl: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padSpacer: {
    width: 68,
    height: 62,
  },
  padButton: {
    width: 68,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padHub: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padHubGlyph: {
    color: '#e8f7fa',
    fontSize: 23,
    fontWeight: '800',
  },
  padLabel: {
    color: '#f2f9ff',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  rotateControl: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    color: '#e4efff',
    fontSize: 7,
    fontWeight: '700',
    marginTop: 3,
  },
  logoArea: {
    width: '100%',
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  brandSpacer: {
    flex: 1,
    minHeight: 12,
  },
  logoText: {
    color: '#dbeaff',
    fontSize: 26,
    fontWeight: '900',
    transform: [{ rotate: '-20deg' }],
    textShadowColor: '#17458e',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 2,
  },
  modelRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  modelLine: {
    flex: 1,
    borderTopWidth: 1,
    borderColor: '#9abff1',
  },
  modelCode: {
    color: '#dfe9ff',
    fontSize: 9,
    fontWeight: '800',
  },
});

function PhysicalButton({ tone, size, children }: PhysicalButtonProps) {
  const rimStyle = {
    yellow: styles.physicalRimYellow,
    red: styles.physicalRimRed,
    green: styles.physicalRimGreen,
    black: styles.physicalRimBlack,
    muted: styles.physicalRimMuted,
  }[tone];
  const faceStyle = {
    yellow: styles.physicalFaceYellow,
    red: styles.physicalFaceRed,
    green: styles.physicalFaceGreen,
    black: styles.physicalFaceBlack,
    muted: styles.physicalFaceMuted,
  }[tone];
  const sizeStyle = {
    utility: styles.physicalButtonUtility,
    direction: styles.physicalButtonDirection,
    rotate: styles.physicalButtonRotate,
  }[size];

  return (
    <View style={[styles.physicalButton, sizeStyle, rimStyle]}>
      <View style={[styles.physicalFace, faceStyle]}>
        <View style={styles.physicalContent}>{children}</View>
      </View>
    </View>
  );
}
