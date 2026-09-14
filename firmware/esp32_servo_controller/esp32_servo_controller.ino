/*
  =============================================================================
  AI HUMANOID PRESENTATION ROBOT — ESP32 SERVO FIRMWARE (V1.1 PRODUCTION)
  =============================================================================
  Target Microcontroller : ESP32 Dev Module / ESP32-WROOM-32 / NodeMCU-32S
  Servos Supported       : SG90, MG90S, MG995, MG996R (180° standard PWM)
  PWM Frequency          : 50 Hz (20ms period)
  Pulse Widths           : 500us (0°) to 2500us (180°)
  Default Signal Pins    : PAN -> GPIO 18 | TILT -> GPIO 19
  Baud Rate              : 115200 bps

  COMMUNICATION PROTOCOL:
  -----------------------------------------------------------------------------
  1. Pan & Tilt Command  : <P:90.0,T:90.0,S:100,C:XX>\n or <P:90.0,T:90.0,S:100>\n
     - P = Pan angle (0.0 - 180.0)
     - T = Tilt angle (0.0 - 180.0)
     - S = Speed percentage (1 - 100, optional, defaults to 80)
     - C = Optional 2-digit Hex XOR Checksum of string between '<' and ',C:'
  2. Single Axis Command : <PAN:90.0,S:100>\n or <TILT:90.0,S:100>\n
  3. Ping / Handshake    : <PING>\n       -> Responds: <PONG>\n
  4. Status Request      : <STATUS>\n     -> Responds: <STATUS:P:90.0,T:90.0,M:0,E:0>\n
  5. Center              : <CENTER>\n     -> Responds: <ACK:CENTER>\n
  6. Emergency Stop      : <!ESTOP>\n     -> Responds: <!ESTOP_ACTIVE>\n
  7. Resume / Clear Stop : <RESUME>\n     -> Responds: <ACK:RESUME>\n
  8. Stop Movement       : <STOP>\n       -> Responds: <ACK:STOP>\n
  9. Gesture Trigger     : <GESTURE:nod>\n -> Responds: <ACK:GESTURE:nod>\n
  =============================================================================
*/

#include <ESP32Servo.h>

// --- PIN DEFINITIONS ---
#define PIN_SERVO_PAN   18   // GPIO 18 for Pan (Yaw - Horizontal)
#define PIN_SERVO_TILT  19   // GPIO 19 for Tilt (Pitch - Vertical)
#define PIN_LED_STATUS   2   // Built-in blue LED for connection & motion status

// --- SERVO CONFIGURATION (MG90S / MG995 / MG996R) ---
#define SERVO_MIN_PULSE_US  500    // 0 degrees (0.5ms)
#define SERVO_MAX_PULSE_US  2500   // 180 degrees (2.5ms)
#define SERVO_PWM_FREQ_HZ   50     // 50Hz standard servo refresh

// --- SERVO OBJECTS ---
Servo servoPan;
Servo servoTilt;

// --- STATE VARIABLES ---
float currentPanAngle  = 90.0;
float currentTiltAngle = 90.0;
float targetPanAngle   = 90.0;
float targetTiltAngle  = 90.0;
int   movementSpeed    = 80;
bool  isEmergencyStop  = false;
bool  isMoving         = false;

unsigned long lastStepTime = 0;
unsigned long lastTelemetryTime = 0;
String inputBuffer = "";
const unsigned int MAX_BUFFER_LEN = 128;

// Compute XOR Checksum of payload string
uint8_t computeChecksum(const String& payload) {
  uint8_t chk = 0;
  for (unsigned int i = 0; i < payload.length(); i++) {
    chk ^= (uint8_t)payload[i];
  }
  return chk;
}

void setup() {
  // Initialize Serial port
  Serial.begin(115200);
  
  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_LED_STATUS, LOW);

  // Allow allocation of all timers for ESP32PWM
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servoPan.setPeriodHertz(SERVO_PWM_FREQ_HZ);
  servoTilt.setPeriodHertz(SERVO_PWM_FREQ_HZ);

  // Attach servos with calibrated pulse width limits
  servoPan.attach(PIN_SERVO_PAN, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  servoTilt.attach(PIN_SERVO_TILT, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);

  // Initialize at centered position (90°, 90°)
  servoPan.write((int)currentPanAngle);
  servoTilt.write((int)currentTiltAngle);

  // Flash status LED 3 times on boot
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED_STATUS, HIGH);
    delay(80);
    digitalWrite(PIN_LED_STATUS, LOW);
    delay(80);
  }

  // Announce ready state over serial
  delay(100);
  Serial.println("<READY:ESP32_SERVO_CONTROLLER_V1.1>");
}

void loop() {
  // 1. Process serial commands
  readSerial();

  // 2. Smooth trajectory stepping toward targets
  updateServoMovement();

  // 3. Periodic telemetry during movement
  broadcastTelemetry();
}

void readSerial() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();

    if (inChar == '<') {
      inputBuffer = "";
    } else if (inChar == '>') {
      if (inputBuffer.length() > 0) {
        parseAndExecuteCommand(inputBuffer);
      }
      inputBuffer = "";
    } else if (inChar != '\r' && inChar != '\n') {
      if (inputBuffer.length() < MAX_BUFFER_LEN) {
        inputBuffer += inChar;
      } else {
        // Buffer overflow protection
        inputBuffer = "";
      }
    }
  }
}

void parseAndExecuteCommand(String cmd) {
  cmd.trim();

  // 1. Emergency Stop command
  if (cmd == "!ESTOP") {
    isEmergencyStop = true;
    isMoving = false;
    digitalWrite(PIN_LED_STATUS, HIGH); // Steady LED on E-Stop
    Serial.println("<!ESTOP_ACTIVE>");
    return;
  }

  // 2. Resume / Clear Emergency Stop
  if (cmd == "RESUME") {
    isEmergencyStop = false;
    digitalWrite(PIN_LED_STATUS, LOW);
    Serial.println("<ACK:RESUME>");
    return;
  }

  if (isEmergencyStop) {
    Serial.println("<ERR:BLOCKED_BY_ESTOP>");
    return;
  }

  // 3. Ping / Handshake Command
  if (cmd == "PING" || cmd == "HELLO" || cmd == "CONNECT") {
    Serial.println("<PONG>");
    return;
  }

  // 4. Status Query
  if (cmd == "STATUS" || cmd == "GET_STATUS") {
    Serial.printf("<STATUS:P:%.1f,T:%.1f,M:%d,E:%d>\n", 
                  currentPanAngle, currentTiltAngle, isMoving ? 1 : 0, isEmergencyStop ? 1 : 0);
    return;
  }

  // 5. Center Command
  if (cmd == "CENTER") {
    targetPanAngle = 90.0;
    targetTiltAngle = 90.0;
    movementSpeed = 80;
    isMoving = true;
    Serial.println("<ACK:CENTER>");
    return;
  }

  // 6. Stop Command
  if (cmd == "STOP") {
    targetPanAngle = currentPanAngle;
    targetTiltAngle = currentTiltAngle;
    isMoving = false;
    Serial.println("<ACK:STOP>");
    return;
  }

  // 7. Pan-only Command: <PAN:90.0,S:80>
  if (cmd.startsWith("PAN:")) {
    float newPan = targetPanAngle;
    int newSpeed = movementSpeed;
    int sIdx = cmd.indexOf(",S:");
    if (sIdx > 0) {
      newPan = cmd.substring(4, sIdx).toFloat();
      newSpeed = cmd.substring(sIdx + 3).toInt();
    } else {
      newPan = cmd.substring(4).toFloat();
    }
    targetPanAngle = constrain(newPan, 0.0, 180.0);
    movementSpeed = constrain(newSpeed, 1, 100);
    isMoving = true;
    Serial.printf("<ACK:PAN:%.1f>\n", targetPanAngle);
    return;
  }

  // 8. Tilt-only Command: <TILT:90.0,S:80>
  if (cmd.startsWith("TILT:")) {
    float newTilt = targetTiltAngle;
    int newSpeed = movementSpeed;
    int sIdx = cmd.indexOf(",S:");
    if (sIdx > 0) {
      newTilt = cmd.substring(5, sIdx).toFloat();
      newSpeed = cmd.substring(sIdx + 3).toInt();
    } else {
      newTilt = cmd.substring(5).toFloat();
    }
    targetTiltAngle = constrain(newTilt, 0.0, 180.0);
    movementSpeed = constrain(newSpeed, 1, 100);
    isMoving = true;
    Serial.printf("<ACK:TILT:%.1f>\n", targetTiltAngle);
    return;
  }

  // 9. Combined Position Command: P:90.0,T:90.0,S:100[,C:XX]
  if (cmd.startsWith("P:") && cmd.indexOf(",T:") > 0) {
    // Optional Checksum Validation
    int cIdx = cmd.lastIndexOf(",C:");
    if (cIdx > 0) {
      String payload = cmd.substring(0, cIdx);
      String chkHexStr = cmd.substring(cIdx + 3);
      uint8_t receivedChk = (uint8_t)strtol(chkHexStr.c_str(), NULL, 16);
      uint8_t calculatedChk = computeChecksum(payload);

      if (receivedChk != calculatedChk) {
        Serial.println("<ERR:CHECKSUM_MISMATCH>");
        return;
      }
      cmd = payload; // Strip checksum field for parsing
    }

    float newPan = targetPanAngle;
    float newTilt = targetTiltAngle;
    int newSpeed = movementSpeed;

    int pStart = 2;
    int tStart = cmd.indexOf(",T:");
    if (tStart > pStart) {
      newPan = cmd.substring(pStart, tStart).toFloat();
    }

    int sStart = cmd.indexOf(",S:", tStart);
    if (sStart > tStart) {
      newTilt = cmd.substring(tStart + 3, sStart).toFloat();
      newSpeed = cmd.substring(sStart + 3).toInt();
    } else {
      newTilt = cmd.substring(tStart + 3).toFloat();
    }

    // Boundary constraints
    newPan = constrain(newPan, 0.0, 180.0);
    newTilt = constrain(newTilt, 0.0, 180.0);
    newSpeed = constrain(newSpeed, 1, 100);

    targetPanAngle = newPan;
    targetTiltAngle = newTilt;
    movementSpeed = newSpeed;
    isMoving = true;

    Serial.printf("<ACK:POS:%.1f,%.1f>\n", targetPanAngle, targetTiltAngle);
    return;
  }

  // 10. Gesture Command: <GESTURE:nod>
  if (cmd.startsWith("GESTURE:")) {
    String gName = cmd.substring(8);
    Serial.printf("<ACK:GESTURE:%s>\n", gName.c_str());
    return;
  }

  // Unknown command
  Serial.printf("<ERR:UNKNOWN_CMD:%s>\n", cmd.c_str());
}

void updateServoMovement() {
  if (!isMoving || isEmergencyStop) return;

  unsigned long now = millis();
  // Adjust step interval based on speed (100% speed = ~10ms/step, 10% = 50ms/step)
  int stepIntervalMs = map(movementSpeed, 1, 100, 45, 8);

  if (now - lastStepTime >= (unsigned long)stepIntervalMs) {
    lastStepTime = now;

    float panDiff = targetPanAngle - currentPanAngle;
    float tiltDiff = targetTiltAngle - currentTiltAngle;

    float maxStep = 2.0; // Max angle increment per tick for smoothness

    if (abs(panDiff) > maxStep) {
      currentPanAngle += (panDiff > 0) ? maxStep : -maxStep;
    } else {
      currentPanAngle = targetPanAngle;
    }

    if (abs(tiltDiff) > maxStep) {
      currentTiltAngle += (tiltDiff > 0) ? maxStep : -maxStep;
    } else {
      currentTiltAngle = targetTiltAngle;
    }

    servoPan.write((int)round(currentPanAngle));
    servoTilt.write((int)round(currentTiltAngle));

    if (abs(currentPanAngle - targetPanAngle) < 0.2 && abs(currentTiltAngle - targetTiltAngle) < 0.2) {
      currentPanAngle = targetPanAngle;
      currentTiltAngle = targetTiltAngle;
      isMoving = false;
      digitalWrite(PIN_LED_STATUS, LOW);
      Serial.printf("<POS:%.1f,%.1f>\n", currentPanAngle, currentTiltAngle);
    } else {
      digitalWrite(PIN_LED_STATUS, HIGH); // LED ON while in active motion
    }
  }
}

void broadcastTelemetry() {
  if (!isMoving) return;
  unsigned long now = millis();
  if (now - lastTelemetryTime >= 100) { // 10 Hz telemetry during movement
    lastTelemetryTime = now;
    Serial.printf("<POS:%.1f,%.1f>\n", currentPanAngle, currentTiltAngle);
  }
}

