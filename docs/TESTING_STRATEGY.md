# Testing Strategy

## Principles

1. Every phase has tests before marking complete
2. Tests must pass — failing tests block phase completion
3. Hardware tests use mock controller — no physical ESP32 required
4. CI runs on every push

---

## Backend Testing (Pytest)

### Test Structure

```
backend/tests/
├── conftest.py          # Shared fixtures
├── api/
│   ├── test_health.py
│   ├── test_robots.py
│   ├── test_servos.py
│   ├── test_gestures.py
│   ├── test_camera.py
│   ├── test_head_tracking.py
│   ├── test_datasets.py
│   ├── test_training.py
│   ├── test_models.py
│   ├── test_predictions.py
│   ├── test_speech.py
│   ├── test_nlp.py
│   ├── test_audience.py
│   └── test_presentation.py
├── services/
│   ├── test_gesture_engine.py
│   ├── test_head_pose.py
│   ├── test_nlp_service.py
│   ├── test_training_service.py
│   └── test_inference_service.py
└── hardware/
    ├── test_mock_controller.py
    ├── test_servo_validation.py
    └── test_angle_limits.py
```

### Key Fixtures

```python
# conftest.py
@pytest.fixture
def test_db():
    # In-memory SQLite for tests
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    ...

@pytest.fixture
def mock_hardware():
    return MockController(test_config)

@pytest.fixture
def client(test_db, mock_hardware):
    # FastAPI TestClient with dependency overrides
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_hardware] = lambda: mock_hardware
    return TestClient(app)
```

### Hardware Tests (Mock Only)

```python
def test_angle_limits_enforced(mock_hardware):
    with pytest.raises(ValueError):
        mock_hardware.move_pan(200)  # Over max

def test_emergency_stop(mock_hardware):
    mock_hardware.move_pan(45)
    mock_hardware.emergency_stop()
    status = mock_hardware.get_status()
    assert not status.servo.is_moving

def test_center_command(mock_hardware, test_config):
    mock_hardware.move_pan(30)
    mock_hardware.center()
    status = mock_hardware.get_status()
    assert status.servo.pan_angle == test_config.pan_center_angle
```

### API Tests

```python
def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_send_command_center(client):
    response = client.post("/api/v1/robots/1/commands",
        json={"command": "CENTER"})
    assert response.status_code == 200

def test_send_invalid_command_rejected(client):
    response = client.post("/api/v1/robots/1/commands",
        json={"command": "INVALID_COMMAND"})
    assert response.status_code == 422

def test_send_out_of_range_angle_rejected(client):
    response = client.post("/api/v1/robots/1/commands",
        json={"command": "MOVE_PAN", "angle": 999})
    assert response.status_code == 422
```

### Gesture Tests

```python
def test_yes_gesture_sequence(gesture_engine):
    commands = gesture_engine.get_gesture_commands("YES")
    # YES: CENTER → DOWN → CENTER → DOWN → CENTER
    commands_list = [c["command"] for c in commands]
    assert commands_list == ["CENTER", "DOWN", "CENTER", "DOWN", "CENTER"]

def test_no_gesture_sequence(gesture_engine):
    commands = gesture_engine.get_gesture_commands("NO")
    commands_list = [c["command"] for c in commands]
    assert commands_list == ["CENTER", "LEFT", "RIGHT", "CENTER", "LEFT", "RIGHT", "CENTER"]
```

---

## Frontend Testing (Vitest + React Testing Library)

### Test Structure

```
frontend/tests/
├── components/
│   ├── DirectionPad.test.tsx
│   ├── StatusIndicator.test.tsx
│   └── AngleDisplay.test.tsx
└── pages/
    ├── DashboardPage.test.tsx
    └── RobotControlPage.test.tsx
```

### Example Tests

```typescript
// DirectionPad.test.tsx
it('fires onMove when left button pressed', async () => {
    const onMove = vi.fn()
    render(<DirectionPad onMove={onMove} />)
    const leftBtn = screen.getByRole('button', { name: /left/i })
    fireEvent.mouseDown(leftBtn)
    expect(onMove).toHaveBeenCalledWith('LEFT')
})

it('fires onStop when left button released', async () => {
    const onStop = vi.fn()
    render(<DirectionPad onStop={onStop} />)
    const leftBtn = screen.getByRole('button', { name: /left/i })
    fireEvent.mouseDown(leftBtn)
    fireEvent.mouseUp(leftBtn)
    expect(onStop).toHaveBeenCalled()
})
```

---

## ML Tests

```python
def test_feature_sequence_schema_valid(sample_feature_file):
    features = load_features(sample_feature_file)
    assert "frames" in features
    assert len(features["frames"]) > 0
    assert "yaw" in features["frames"][0]
    assert "pitch" in features["frames"][0]

def test_model_inference_returns_known_class(active_model, sample_window):
    result = active_model.predict(sample_window)
    assert result.gesture in KNOWN_GESTURE_LABELS
    assert 0.0 <= result.confidence <= 1.0

def test_confidence_threshold_prevents_trigger(inference_service):
    # Low-confidence prediction should NOT trigger action
    result = inference_service.process_frame(low_conf_features)
    assert not result.action_triggered
```

---

## Running Tests

```bash
# Backend
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing

# Frontend
cd frontend
npm run test
npm run test:coverage

# Type checking
cd backend && mypy app/
cd frontend && npm run type-check
```

---

## CI Requirements

Every push must pass:
- Backend pytest suite (all tests)
- Frontend Vitest suite (all tests)
- Ruff lint (backend)
- mypy type check (backend)
- ESLint (frontend)
- TypeScript compiler (frontend)

No physical hardware required for CI.
