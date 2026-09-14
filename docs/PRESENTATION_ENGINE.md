# Presentation Engine Design

## Responsibility

The Presentation Engine orchestrates all robot behaviors during a live presentation session. It is the top-level coordinator that combines:

- Audience tracking (where to look)
- Speech/NLP processing (what gesture to make)
- Movement priority and cooldown management
- Session state management

---

## Session States

```
IDLE
  ↓ (start session)
STARTING
  ↓ (camera + services ready)
ACTIVE
  ↓ (pause command)
PAUSED
  ↓ (resume)
ACTIVE
  ↓ (end command / timeout)
ENDING
  ↓
IDLE
```

---

## Movement Priority Queue

Multiple sources may try to command the robot simultaneously. Priority (highest first):

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Emergency Stop | Overrides everything |
| 2 | Manual Control | Operator override |
| 3 | NLP Gesture | Triggered by speech intent |
| 4 | Audience Attention | Look toward target person |
| 5 | Head Mimic | Follow human operator |
| 6 | Idle Behavior | Default idle movement |

If a higher-priority action is executing, lower-priority commands are queued or dropped.

---

## Presentation Flow

```python
async def run_presentation_session(session_id: str):
    # 1. Start camera
    await camera_service.start()

    # 2. Start audience tracking
    await audience_service.start()

    # 3. Generate and speak opening greeting
    greeting = greeting_service.get_time_aware_greeting()
    await text_to_speech(f"{greeting} everyone.")

    # 4. Look toward audience
    target = audience_service.get_primary_target()
    if target:
        await movement_engine.look_at(target.position)

    # 5. Start speech recognition
    await speech_service.start()

    # 6. Main presentation loop
    while session.is_active():
        # Audience attention management
        target = audience_service.update_target()
        if target and not movement_engine.is_busy():
            await movement_engine.look_at_smoothly(target.position)

        # NLP-driven gesture (processed asynchronously via events)
        # Speech events → NLP → gesture commands injected to movement queue

        await asyncio.sleep(0.033)  # ~30fps

    # 7. Cleanup
    await speech_service.stop()
    await audience_service.stop()
    await camera_service.stop()
    await movement_engine.center()
```

---

## Audience Attention Strategy (Initial)

```python
class MostCentralTargetStrategy:
    def select_target(self, faces: list[Face]) -> Optional[Face]:
        if not faces:
            return None
        # Score by proximity to center of frame
        frame_center = (0.5, 0.5)
        def centrality(face):
            dx = face.center_x - frame_center[0]
            dy = face.center_y - frame_center[1]
            return -(dx**2 + dy**2)  # negative distance
        return max(faces, key=centrality)
```

Target switching:
- Maintain current target for `AUDIENCE_TARGET_DURATION_SECONDS`
- After duration: consider switching to another visible person
- Avoid switching to same person twice in a row if others present

---

## Gesture Priority and Cooldown

```python
class MovementDecisionEngine:

    def __init__(self):
        self._cooldown_until: dict[str, float] = {}
        self._current_priority = 0
        self._busy = False

    async def request_gesture(
        self,
        gesture_name: str,
        priority: int,
        source: str
    ) -> bool:
        if priority < self._current_priority:
            return False  # Higher priority action running

        gesture = self.cooldown_until.get(gesture_name, 0)
        if time.time() < gesture:
            return False  # Still cooling down

        await self._execute_gesture(gesture_name)
        self._cooldown_until[gesture_name] = time.time() + GESTURE_COOLDOWN
        return True
```

---

## Time-Aware Greeting Integration

```python
class GreetingService:
    def get_greeting(self) -> str:
        hour = datetime.now().hour
        if hour < settings.GREETING_MORNING_END:
            period = "morning"
        elif hour < settings.GREETING_AFTERNOON_END:
            period = "afternoon"
        else:
            period = "evening"
        return f"Good {period}"

    def get_full_greeting(self) -> str:
        return f"{self.get_greeting()} everyone. Welcome to today's presentation."
```

Greeting endpoint:
```
GET /api/v1/presentation/greeting
→ {"greeting": "Good morning", "full_text": "Good morning everyone. Welcome to today's presentation.", "hour": 10}
```
