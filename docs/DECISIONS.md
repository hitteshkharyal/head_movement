# Architectural Decision Records (ADR)

This document explains WHY key architectural decisions were made, not just what was chosen.

---

## ADR-001: Two-Service Architecture

**Decision**: The system is deployed as exactly two services — Frontend and Backend.

**Context**: AI robotics systems can grow into many microservices (ML service, camera service, NLP service, hardware service, etc.). This fragmentation introduces operational complexity.

**Options considered**:
1. Monolith (single deployable unit)
2. Two services (Frontend + Backend)
3. Microservices (separate ML, camera, NLP, hardware services)

**Chosen**: Option 2 — Two services

**Why**:
- A single developer/small team can operate two services without an orchestration platform (Kubernetes, etc.)
- All AI/robotics intelligence is Python-based — keeping it together in one backend allows shared imports, in-process communication, and shared state without serialization overhead
- Camera frames, ML inference, and hardware commands form a tight pipeline — splitting them into separate services would add network latency to a real-time control loop
- The frontend is JavaScript/TypeScript — it must be a separate service

**Advantages**: Simpler ops, lower latency pipeline, easier debugging

**Disadvantages**: Backend must handle multiple responsibilities; can become large

**Migration path**: If the backend becomes too large, individual modules (e.g., ML training) can be extracted into separate services without changing the frontend. The ML training pipeline in particular is a natural extraction point.

---

## ADR-002: Python + FastAPI for Backend

**Decision**: Backend is Python 3.11+ with FastAPI.

**Context**: The backend must handle computer vision (OpenCV), ML (scikit-learn/PyTorch), hardware control (serial/socket), and serve a REST+WebSocket API.

**Options considered**:
1. Python + FastAPI
2. Python + Flask
3. Node.js + Express
4. Go + Gin

**Chosen**: Python + FastAPI

**Why**:
- Python is the dominant language for OpenCV, MediaPipe, NumPy, scikit-learn, PyTorch — no foreign language bindings needed
- FastAPI has native async support (asyncio), critical for non-blocking camera pipelines
- FastAPI has first-class WebSocket support
- FastAPI generates OpenAPI docs automatically (useful for development)
- Pydantic provides request/response validation with type safety
- FastAPI's dependency injection is clean for swapping mock/real hardware

**Advantages**: Best library ecosystem for AI/CV/robotics; async; auto-docs; type-safe schemas

**Disadvantages**: Python GIL limits true parallelism; slower than compiled languages for CPU-bound tasks

**Migration path**: CPU-bound ML training can run in `ProcessPoolExecutor` to bypass GIL. Critical inference paths can be wrapped in separate processes if needed.

---

## ADR-003: React + Vite for Frontend

**Decision**: Frontend is React 18 with TypeScript, built by Vite.

**Context**: Need a modern, maintainable UI with real-time updates (WebSocket), responsive design, and component reuse.

**Options considered**:
1. React + Vite
2. Next.js
3. Vue + Vite
4. Svelte

**Chosen**: React + Vite

**Why**:
- React has the largest ecosystem and team familiarity
- Vite provides extremely fast dev server HMR
- Not using Next.js because SSR is not needed — this is a local/intranet tool
- TypeScript adds compile-time safety for WebSocket message types and API contracts

**Advantages**: Fast dev experience, large ecosystem, TypeScript safety

**Disadvantages**: React adds runtime bundle overhead vs Svelte; no SSR needed but could be added

---

## ADR-004: OpenCV + MediaPipe for Head Tracking

**Decision**: Use OpenCV for camera I/O and MediaPipe FaceMesh for landmark detection and head pose estimation via PnP.

**Context**: We need real-time head pose (yaw, pitch, roll) at ~30fps. Options range from geometric methods to deep neural networks.

**Options considered**:
1. OpenCV + MediaPipe FaceMesh + PnP solve
2. dlib + face_recognition library
3. Train a custom head pose regression CNN
4. Commercial SDKs (e.g., OpenFace)

**Chosen**: OpenCV + MediaPipe FaceMesh + solvePnP

**Why**:
- MediaPipe FaceMesh delivers 468 landmarks in real-time without GPU on CPU-only machines
- solvePnP is a classical geometric solver — deterministic, interpretable, no training data needed
- This approach works correctly before any ML is available
- The outputs (yaw, pitch, roll) are immediately meaningful and mappable to servo angles
- Avoids training data dependency in early phases

**Advantages**: Fast, accurate, no GPU required, no training data needed, deterministic

**Disadvantages**: Not as robust as trained models in extreme poses; requires camera calibration for best accuracy

**Migration path**: If accuracy is insufficient, replace head_pose_estimator.py with a trained model — the rest of the pipeline is unchanged.

---

## ADR-005: Feature-Based Temporal Gesture Learning

**Decision**: ML gesture recognition operates on extracted feature sequences (yaw/pitch/roll + landmarks over time), not raw image frames.

**Context**: We need to recognize gestures like YES (head nodding) and NO (head shaking). Options range from image classification to time-series classification.

**Options considered**:
1. Image classification (CNN on raw frames)
2. Video classification (3D CNN or VideoTransformer)
3. Feature extraction + temporal classification (Random Forest / LSTM on pose features)

**Chosen**: Feature extraction + temporal classification

**Why**:
- YES and NO gestures are fundamentally temporal patterns in yaw/pitch — the pattern is "movement over time", not "appearance"
- Raw image classification would require enormous training data and GPU
- Feature sequences (yaw, pitch, roll, timestamps) capture the essential information in ~9 numbers per frame
- A Random Forest or LSTM on 30-frame windows of pose features can achieve high accuracy with as few as 50 samples per class
- Storage: feature sequences are kilobytes vs. video files at megabytes

**Advantages**: Small training data requirement; fast training; fast inference; interpretable features; no GPU needed

**Disadvantages**: Feature extraction pipeline must be reliable; if MediaPipe fails, inference fails

**Migration path**: If more complex gestures are needed (involving appearance, not just pose), augment features to include embedding vectors from a vision encoder.

---

## ADR-006: Hardware Abstraction Layer

**Decision**: All ESP32 communication is isolated behind a `HardwareController` abstract class.

**Context**: Physical hardware is often unavailable during development. Tightly coupling hardware code to business logic makes testing and development painful.

**Options considered**:
1. Direct ESP32 calls in service code
2. Abstract interface with mock/real implementations
3. Message queue to separate hardware worker

**Chosen**: Abstract interface with mock/real implementations

**Why**:
- FastAPI dependency injection allows swapping mock → real without changing route handlers
- Tests run without physical hardware — CI is possible
- The entire UI/backend pipeline can be developed and tested before an ESP32 is available
- When the real ESP32 is connected, only `ESP32_CONNECTION_TYPE=mock` → `serial` is changed in `.env`

**Advantages**: Hardware-independent development; testable; easily replaceable

**Disadvantages**: Small abstraction overhead; must keep mock behavior realistic

---

## ADR-007: Database + Filesystem Separation

**Decision**: Metadata goes in SQLite/PostgreSQL. Large binary files (videos, models) go in the filesystem with path references in the database.

**Context**: Database BLOB fields for large files create performance problems and make backups unwieldy.

**Options considered**:
1. Everything in database (BLOB fields for videos/models)
2. Everything in filesystem (no database)
3. Metadata in database, binaries in filesystem

**Chosen**: Option 3

**Why**:
- SQL is excellent for structured queries: "find all samples for gesture X", "find all models trained after date Y"
- SQL is poor at storing/streaming 100MB video files
- Filesystem is excellent at large binary I/O
- Separate backup strategies: database for structured data, filesystem for binary data
- Feature files are typically <1MB each — still stored in filesystem for consistency

**Advantages**: Query flexibility; backup clarity; no DB performance degradation from BLOBs

**Disadvantages**: Path references can become stale if files are moved — must use controlled file management APIs

---

## ADR-008: Model Versioning

**Decision**: Every trained model gets a version ID. Only one model is marked "active" per task.

**Context**: ML models improve over time. Without versioning, it is impossible to roll back to a previous model or compare performance.

**Options considered**:
1. Overwrite single model file
2. Version by timestamp
3. Explicit version numbers + activation state

**Chosen**: Explicit version numbers + activation state

**Why**:
- Rollback: if v002 performs worse than v001, activate v001 instantly
- Audit trail: know when each model was trained and what data it used
- A/B testing: easy to switch between models
- Prevents accidental overwrites

**Advantages**: Reproducibility; rollback; audit trail; A/B testing

**Disadvantages**: More disk space; more DB records to manage

---

## ADR-009: SQLite First, PostgreSQL Later

**Decision**: Development uses SQLite. Production deployment can use PostgreSQL by changing `DATABASE_URL`.

**Context**: Setting up a PostgreSQL server adds friction during early development.

**Options considered**:
1. PostgreSQL from day one
2. SQLite development, PostgreSQL production (same schema)
3. MongoDB

**Chosen**: Option 2

**Why**:
- SQLite requires zero server setup — works immediately
- SQLAlchemy + Alembic abstract the database vendor
- The schema is identical between SQLite and PostgreSQL
- Migration is a one-line environment variable change + `alembic upgrade head`
- SQLite is perfectly adequate for a single-user robotics workstation

**Advantages**: Zero-friction development; easy migration

**Disadvantages**: SQLite has write concurrency limits — unsuitable for multi-user production. Use PostgreSQL for production.

**Migration path**: Change `DATABASE_URL`, run `alembic upgrade head`, restart.

---

## ADR-010: REST + WebSocket Communication

**Decision**: REST API for commands and configuration; WebSocket for live streaming data.

**Context**: The dashboard needs both durable command-response interactions and real-time streaming data (camera pose, servo positions).

**Options considered**:
1. REST only (polling for live data)
2. WebSocket only (all communication)
3. REST for commands + WebSocket for streaming

**Chosen**: REST for commands + WebSocket for streaming

**Why**:
- REST is semantically correct for commands and configuration — idempotent, cacheable, testable
- WebSocket is the right tool for ~30fps pose streaming — REST polling at 30fps would flood the server
- REST gives HTTP status codes, request IDs, and standard tooling (curl, Swagger, etc.)
- WebSocket gives low-latency, full-duplex streaming without polling overhead

**Advantages**: Each protocol used where it excels; standard tooling for commands; efficient live streaming

**Disadvantages**: Two connection types to manage on the frontend; WebSocket reconnection logic needed

---

## ADR-011: Phase-by-Phase Development

**Decision**: Development proceeds in 15 numbered phases. No phase starts until the previous is tested and committed.

**Context**: The full system is complex (hardware + CV + ML + speech + NLP + audience tracking). Building everything together before testing anything makes debugging nearly impossible.

**Options considered**:
1. Build everything, test at the end
2. Phase-by-phase development with mandatory testing gates

**Chosen**: Phase-by-phase development

**Why**:
- Each phase produces a working, testable system
- Hardware bugs are found when hardware is introduced (Phase 1), not after months of other development
- Computer vision accuracy issues are found at Phase 4, not at Phase 14
- Stakeholders can see working functionality at each phase
- Roll back to a known-good state if a phase is problematic

**Advantages**: Incremental risk reduction; early working demos; clear progress tracking

**Disadvantages**: Some rework may be needed when later phases add requirements to earlier components
