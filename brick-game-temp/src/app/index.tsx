import { useCallback, useEffect, useRef, useState } from 'react';
import {
    PanResponder,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

type GameStatus = 'playing' | 'won' | 'lost';

type GameState = {
  ball: Ball;
  paddle: Paddle;
  bricks: Brick[];
  score: number;
  lives: number;
  status: GameStatus;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function createBricks(boardWidth: number) {
  const columns = 5;
  const rows = 4;
  const gap = 8;
  const leftPadding = 22;
  const topPadding = 24;
  const brickWidth = (boardWidth - leftPadding * 2 - gap * (columns - 1)) / columns;
  const brickHeight = 18;
  const colors = ['#7dd3fc', '#a78bfa', '#f9a8d4', '#fbbf24'];

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
        color: colors[row % colors.length],
      });
    }
  }

  return bricks;
}

function createGameState(boardWidth: number, boardHeight: number): GameState {
  const paddleWidth = 96;
  const paddleHeight = 14;

  return {
    ball: {
      x: boardWidth / 2,
      y: boardHeight - 62,
      radius: 8,
      vx: 3.6,
      vy: -4.4,
    },
    paddle: {
      x: boardWidth / 2 - paddleWidth / 2,
      y: boardHeight - 26,
      width: paddleWidth,
      height: paddleHeight,
    },
    bricks: createBricks(boardWidth),
    score: 0,
    lives: 3,
    status: 'playing',
  };
}

export default function HomeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const boardWidth = Math.min(screenWidth - 24, 380);
  const boardHeight = Math.min(Math.max(screenHeight * 0.62, 430), 560);

  const [game, setGame] = useState<GameState>(() => createGameState(boardWidth, boardHeight));
  const paddleDragStart = useRef(0);

  const movePaddle = useCallback(
    (amount: number) => {
      setGame((previous) => {
        if (previous.status !== 'playing') {
          return previous;
        }

        const nextX = clamp(
          previous.paddle.x + amount,
          0,
          boardWidth - previous.paddle.width,
        );

        return {
          ...previous,
          paddle: {
            ...previous.paddle,
            x: nextX,
          },
        };
      });
    },
    [boardWidth],
  );

  const resetGame = useCallback(() => {
    setGame(createGameState(boardWidth, boardHeight));
  }, [boardWidth, boardHeight]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        paddleDragStart.current = game.paddle.x;
      },
      onPanResponderMove: (_, gestureState) => {
        setGame((previous) => {
          if (previous.status !== 'playing') {
            return previous;
          }

          const nextX = clamp(
            paddleDragStart.current + gestureState.dx,
            0,
            boardWidth - previous.paddle.width,
          );

          return {
            ...previous,
            paddle: {
              ...previous.paddle,
              x: nextX,
            },
          };
        });
      },
    }),
  ).current;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        movePaddle(-28);
      }
      if (event.key === 'ArrowRight') {
        movePaddle(28);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }

    return undefined;
  }, [movePaddle]);

  useEffect(() => {
    const tick = () => {
      setGame((previous) => {
        if (previous.status !== 'playing') {
          return previous;
        }

        const nextBall = { ...previous.ball };
        const nextBricks = previous.bricks.map((brick) => ({ ...brick }));
        const nextPaddle = { ...previous.paddle };
        let nextLives = previous.lives;
        let nextScore = previous.score;
        let nextStatus: GameStatus = previous.status;

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
        const ballLeft = nextBall.x - nextBall.radius;
        const ballRight = nextBall.x + nextBall.radius;

        const hitPaddle =
          nextBall.vy > 0 &&
          ballBottom >= paddleTop &&
          ballTop <= paddleBottom &&
          nextBall.x >= paddleLeft &&
          nextBall.x <= paddleRight;

        if (hitPaddle) {
          const relativeImpact = (nextBall.x - (paddleLeft + nextPaddle.width / 2)) / (nextPaddle.width / 2);
          nextBall.vy = -Math.abs(nextBall.vy);
          nextBall.vx = relativeImpact * 5.5;
          nextBall.y = paddleTop - nextBall.radius - 1;
        }

        for (const brick of nextBricks) {
          if (!brick.alive) {
            continue;
          }

          const brickLeft = brick.x;
          const brickRight = brick.x + brick.width;
          const brickTop = brick.y;
          const brickBottom = brick.y + brick.height;

          const intersects =
            nextBall.x + nextBall.radius > brickLeft &&
            nextBall.x - nextBall.radius < brickRight &&
            nextBall.y + nextBall.radius > brickTop &&
            nextBall.y - nextBall.radius < brickBottom;

          if (!intersects) {
            continue;
          }

          brick.alive = false;
          nextScore += 10;

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
              ...previous,
              ball: {
                x: boardWidth / 2,
                y: boardHeight - 64,
                radius: 8,
                vx: 3.6,
                vy: -4.4,
              },
              paddle: {
                ...previous.paddle,
                x: boardWidth / 2 - previous.paddle.width / 2,
              },
              lives: nextLives,
            };
          }
        }

        if (nextBricks.every((brick) => !brick.alive)) {
          nextStatus = 'won';
        }

        return {
          ...previous,
          ball: nextBall,
          paddle: nextPaddle,
          bricks: nextBricks,
          score: nextScore,
          lives: nextLives,
          status: nextStatus,
        };
      });
    };

    const intervalId = setInterval(tick, 16);
    return () => clearInterval(intervalId);
  }, [boardHeight, boardWidth]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.scoreText}>Score: {game.score}</Text>
          <Text style={styles.scoreText}>Lives: {game.lives}</Text>
        </View>

        <View
          {...panResponder.panHandlers}
          style={[styles.board, { width: boardWidth, height: boardHeight }]}
        >
          {game.bricks.map((brick) =>
            brick.alive ? (
              <View
                key={brick.id}
                style={[
                  styles.brick,
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
              styles.paddle,
              {
                left: game.paddle.x,
                top: game.paddle.y,
                width: game.paddle.width,
                height: game.paddle.height,
              },
            ]}
          />

          <View
            style={[
              styles.ball,
              {
                width: game.ball.radius * 2,
                height: game.ball.radius * 2,
                left: game.ball.x - game.ball.radius,
                top: game.ball.y - game.ball.radius,
              },
            ]}
          />

          {game.status !== 'playing' && (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {game.status === 'won' ? 'You Win!' : 'Game Over'}
              </Text>
              <Text style={styles.overlaySubtitle}>Final Score: {game.score}</Text>
              <Pressable onPress={resetGame} style={styles.restartButton}>
                <Text style={styles.restartText}>Play Again</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.controlsRow}>
          <Pressable onPress={() => movePaddle(-30)} style={styles.controlButton}>
            <Text style={styles.controlText}>◀</Text>
          </Pressable>
          <Pressable onPress={() => movePaddle(30)} style={styles.controlButton}>
            <Text style={styles.controlText}>▶</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#020817',
  },
  headerRow: {
    width: '100%',
    maxWidth: 380,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  scoreText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700',
  },
  board: {
    position: 'relative',
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  brick: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  paddle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    shadowColor: '#f8fafc',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  ball: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#f97316',
    shadowColor: '#f97316',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 18,
  },
  controlButton: {
    width: 90,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 8, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayTitle: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  overlaySubtitle: {
    color: '#cbd5e1',
    fontSize: 16,
    marginBottom: 18,
  },
  restartButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  restartText: {
    color: '#052e16',
    fontWeight: '800',
    fontSize: 16,
  },
});
