# Continuous particles and camera Pose validation

Only the integrated PLAYGROUND copy is changed. Standalone repositories are unchanged.
Baseline main: `4aaaeed8f105c2560b055298cf2a2dc4a51ce6ea`.

## Causes and correction

- The previous damped target velocity consisted only of weather/body/hands, so a stopped hand eventually produced zero particle speed. Ambient downward flow plus gentle spatial/temporal horizontal drift now participates in that same target and existing speed cap/damping. There is still one WindEngine for DOT/KIDS/ART, PC, DIRECT and camera input.
- The previous upper-body fallback retained/estimated a hip root, used first-frame maximum extent for scale, and adopted WORLD using only torso confidence. Partial world data could omit an elbow despite a valid normalized elbow, and the diagonal camera view made projected comparison difficult.
- Upper-body frames now use SHOULDER CENTER, omit legs and keep a single uniform shoulder-based scale. FULL BODY requires three consecutive reliable hip/knee/ankle frames and uses HIP CENTER. WORLD needs every currently visible/used torso joint plus consistent arm, torso, head and leg proportions; otherwise the entire frame uses NORMALIZED. Adoption takes five stable world frames; a rejected world frame imposes a one-second recovery cooldown. Canonical mapped coordinates blend over 250ms on source/root changes, never mixing raw world/metre and image coordinates point by point. During this rebase, derivative seeding prevents a fake hand gust. Missing upper joints can be displayed for150ms, but do not generate physical hand input. Normalized X and depth use the input frame width/height ratio so a uniform 3D scale preserves 2D pixel-space arm proportions in landscape and portrait video. The Worker/Pipeline carry the actual inference bitmap dimensions, with video dimensions as fallback. Default view is frontal; drag/zoom/reset remain available.
- The mapper is evaluated once per new Pose result. Avatar and physical hand input consume that same frame. Existing hand confidence, jump rejection, velocity limits, colors and avatar size/style controls remain. Previously the avatar scaled its trunk but restored unscaled wrist anchors, which distorted arm proportions at non100% sizes. Pose display scaling now uniformly transforms all joints and the shared hand centers; the centers therefore follow the displayed pose. Hand velocity gain is normalized by the same scale, so sensitivity and radius are unchanged. Standard pose size retains room for20–300% zoom inside the cube. MediaPipe depth is inverted for the front-facing +Z view. POSE AGE uses the captured timestamp; fade/hold thresholds continue to use accepted-result age. Pose detection is reported separately from BODY-axis availability, including upper-body frames with no reliable hips. Confident shoulders/hips still drive BODY WIND when knees/ankles are cropped; leg visibility affects avatar mode, not torso wind availability. Camera images and body landmarks are not stored or sent externally.
- Confident upper-body detection is also a valid growth heartbeat; motion is not required. Completion synchronously finalizes results/gallery before resource release (avoiding a RAF/100ms UI timer race), preserves a CPU snapshot of the grown tree, stops camera and Workers and loses the WebGL context. Replay creates a fresh renderer using retained CPU scene data. Exit disposes all scene objects and the common engine.

## Added controls

PARTICLE FLOW: AMBIENT FLOW (default ON), AMBIENT SPEED0–100% (default40%), DRIFT/TURBULENCE0–100% (default25%), VERTICAL FLOW DOWN/UP/NONE (default DOWN). These values persist with existing settings. All isolated diagnostic presets and ALL OFF disable ambient; ALL ON includes it.

DIRECT HAND TEST is separate from PC TEST and camera. Select LEFT or RIGHT, then drag on the canvas. Pointer-ray intersection with the Z=0 plane supplies the standard hand position contract; stationary pointer input naturally decays hand wind while ambient continues. No extra physics or Pose model is created.

Boundary crossings preserve periodic position in the crossing axis and randomize the tangent coordinates. Each particle has a generation counter: all trail samples from an old generation are discarded immediately, including reinsertion jumps shorter than half the cube. Movement metrics exclude teleport distance and measure actual integrated position changes. Tests cover all six faces, long circulation, and8000-particle history bounds.

## Measured response (synthetic, visual world units)

1000 particles,60Hz physics; ambient speed40%, drift25%; hand speed0.4 units/s. The movement measure is whole-field mean travel during the last simulation second, excluding reinsertion.

| State | Mean particle speed | Last-second travel |
| --- | ---: | ---: |
| No ambient, all other inputs OFF after settling | <0.000001 | approximately0 |
| Ambient only, stopped hands | 0.28216 | 0.28202 |
| Same ambient plus moving left hand | 0.31036 | 0.31000 |
| Stop the hand for3 seconds, ambient stays ON | 0.28225 | 0.28223 |

At the last state, hand wind is approximately6.1e-22: background continues without residual local wind. Initial pure downward ambient reaches0.2800 units/s. The pure diagnostic tests disable ambient and check actual buffers, not just sphere positions.

Browser fixture observations vary with rendering cadence. DIRECT left/right drag produced mean travel around0.25–0.26 units over the last second, with positive local wind and >100 sphere-near particles. The CAMERA ON test uses a generated video stream and the production PosePipeline/asynchronous Worker transport; only the Worker model output is a synthetic Pose fixture. Upper-body results have23 valid joints, NORMALIZED coordinates, no legs, matching wrist/field centers, and positive wind and particle travel. Full-body recovery produces33 joints and WORLD after stabilization. Tests also check detection loss/recovery, growth completion, camera/Worker/GPU release and replay.

## Regression and limitations

`npm test` covers21 unit cases. `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` covers8 browser cases under the production Pages prefix, reading actual WebGL pixels in DOT/KIDS/ART. The existing seesaw game, wind-tree PC DEMO, PHOTO GIFT selection/save/erase, failure diagnostics and participant photo clearing are included. `npm run build` verifies109 local import/asset references. GitHub CI repeats these and stores browser evidence.

There is no real participant, physical camera or physical tablet/phone in this environment. Synthetic Pose and generated camera tests do not establish real-human tracking quality, occlusion performance, depth accuracy or real-device frame rate. GPS accuracy and person-triggered smile capture remain physical-device checks; unchanged PHOTO GIFT and capture interfaces are covered by regression fixtures.
