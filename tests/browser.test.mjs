import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright-core";

const prefix = "/kaze-ni-tatsu-playground/";
const site = resolve(import.meta.dirname, "../dist");
let server, browser, base;
before(async () => {
  server = createServer(async (req, res) => {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const target = resolve(site, path.slice(prefix.length) || "index.html");
    if (!target.startsWith(site + "/")) {
      res.writeHead(403).end();
      return;
    }
    try {
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(target)] || "application/octet-stream",
      });
      res.end(await readFile(target));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  await mkdir(resolve(site, "../test-results"), { recursive: true });
});
after(async () => {
  await browser?.close();
  await new Promise((r) => server?.close(r));
});
async function pageFor(t) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  t.after(() => page.close());
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  return { page, errors, requests };
}
async function launch(page, game) {
  await page.goto(base);
  await page.locator(`[data-game="${game}"]`).click();
  await page.locator("#launch-button").click();
  await page.waitForURL(`**/games/${game}/index.html?*`);
}
async function pixels(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const canvas = document.querySelector(".lab-stage > canvas");
          const gl =
            canvas?.getContext("webgl2") || canvas?.getContext("webgl");
          if (!gl) {
            resolve({ colors: 0, nonBackground: 0 });
            return;
          }
          const data = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
          const colors = new Set();
          let nonBackground = 0;
          for (let i = 0; i < data.length; i += 4) {
            colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
            if (
              data[i] !== data[0] ||
              data[i + 1] !== data[1] ||
              data[i + 2] !== data[2]
            )
              nonBackground++;
          }
          resolve({
            colors: colors.size,
            nonBackground,
            width: canvas.width,
            height: canvas.height,
          });
        }),
      ),
  );
}
async function rendered(page, name) {
  const result = await pixels(page);
  assert.ok(
    result.colors > 8 && result.nonBackground > 100,
    `${name}: actual WebGL pixels ${JSON.stringify(result)}`,
  );
  await page.screenshot({ path: resolve(site, `../test-results/${name}.png`) });
  console.log(`${name}: ${JSON.stringify(result)}`);
}

test("Pages prefix: real DOT/KIDS/ART rendering, PC TEST, avatar, hand debug, and reopen", async (t) => {
  const { page, errors, requests } = await pageFor(t);
  await launch(page, "wind-tree");
  await page.locator("#windLabBtn").click();
  await page.locator(".lab-stage > canvas").waitFor();
  await page.waitForFunction(() =>
    /RENDER FPS [1-9]/.test(document.querySelector("#labDebug").textContent),
  );
  assert.equal(
    await page.locator("#windLab").getAttribute("data-display-mode"),
    "DOT",
  );
  await rendered(page, "dot");
  await page.locator("#lab-avatar").check();
  await page.locator("#lab-handDebug").check();
  await page.locator("#labPoseTest").selectOption("F");
  await page.waitForFunction(() =>
    document
      .querySelector("#labDebug")
      .textContent.includes("SYNTHETIC POSE TEST F"),
  );
  await rendered(page, "avatar-hand-debug");
  await page.locator("#labPc").click();
  assert.equal(await page.locator("#labPcPanel").isVisible(), false);
  await page.locator("#labPc").click();
  assert.equal(await page.locator("#labPcPanel").isVisible(), true);
  for (const mode of ["KIDS", "ART"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal(
      await page.locator("#windLab").getAttribute("data-display-mode"),
      mode,
    );
    await page.locator("#labDuration").fill("2");
    await page.locator("#labStartPlay").click();
    await page.waitForFunction(
      () => Number(document.querySelector("#labGrowth").value) > 0.2,
    );
    await rendered(page, mode.toLowerCase());
    await page.locator("#labResult").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#labResultText").textContent(),
      new RegExp(mode),
    );
    await page.locator("#labResetPlay").click();
  }
  await page.locator("#labExit").click();
  assert.equal(await page.locator("#windLab").isVisible(), false);
  assert.equal(
    await page.locator("#camera").evaluate((v) => v.parentElement.id),
    "app",
  );
  await page.locator("#windLabBtn").click();
  await page.locator(".lab-stage > canvas").waitFor();
  await rendered(page, "reopened-dot");
  assert.deepEqual(errors, []);
  assert.ok(
    !requests.some((url) => url.includes("cdn.jsdelivr.net/npm/three")),
    "3D startup must not require the CDN",
  );
});

test("missing dependency produces a console exception and actionable screen diagnosis", async (t) => {
  const { page } = await pageFor(t);
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  await page.route("**/vendor/three/OrbitControls.js", (route) =>
    route.abort("failed"),
  );
  await page.goto(base + "games/wind-tree/index.html");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() =>
    document.querySelector("#startStatus").textContent.includes("TypeError"),
  );
  assert.match(
    await page.locator("#startStatus").textContent(),
    /原因:.*Failed to fetch dynamically imported module/,
  );
  assert.ok(
    consoleErrors.some((m) => m.includes("3D WIND LAB startup failed")),
  );
  assert.equal(await page.locator("#app").isVisible(), true);
});

test("WebGL initialization failure is propagated and cleaned up", async (t) => {
  const { page } = await pageFor(t);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (/^webgl|^experimental-webgl/.test(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto(base + "games/wind-tree/index.html");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#startStatus")
      .textContent.includes("Error creating WebGL context"),
  );
  assert.equal(await page.locator("#app").isVisible(), true);
  assert.equal(await page.locator("#windLab").isVisible(), false);
  assert.equal(
    await page.locator("#windLab").evaluate((root) => root.childElementCount),
    0,
  );
  assert.equal(
    await page.locator("#camera").evaluate((v) => v.parentElement.id),
    "app",
  );
});

test("wind-tree PC DEMO and original PHOTO GIFT selection/download/erase", async (t) => {
  const { page, errors } = await pageFor(t);
  await launch(page, "wind-tree");
  await page.locator("#durationNumber").fill("1");
  await page.locator("#testBtn").click();
  await page.locator("#finish").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#photoStatus").textContent(),
    /PCテストモード/,
  );
  // Synthetic image fixture exercises the existing PhotoSession and PhotoUI without a real participant.
  await page.evaluate(async () => {
    const { PhotoSession } = await import("./photos.mjs");
    const { PhotoUI } = await import("./photo-ui.mjs");
    const session = new PhotoSession();
    session.start("browser-test");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "orange";
    ctx.fillRect(0, 0, 32, 32);
    session.add(
      await new Promise((r) => canvas.toBlob(r, "image/jpeg")),
      { quality: 1, elapsedSec: 1, smileScore: 0.8 },
      "browser-test",
    );
    window.photoFixture = { session, ui: new PhotoUI(session) };
    const {getSharedGift}=await import('../../shared/photo-gift.js?v=seesaw-counted-capture');
    document.querySelector('#app').classList.add('hidden');
    await getSharedGift().open({session,result:{growth:.5},hasConsent:true,onBack(){},onNext(){}});
  });
  await page.locator("#gift-photo-list button").click();
  await page.waitForFunction(()=>photoFixture.session.selectedId!==null);
  assert.equal(
    await page.evaluate(() => photoFixture.session.getSelectedGift().blob.type),
    "image/jpeg",
  );
  const downloaded = page.waitForEvent("download");
  await page.locator("#gift-format").selectOption("jpeg");
  await page.locator("#gift-save").click();
  assert.match(
    (await downloaded).suggestedFilename(),
    /kaze-ni-tatsu-.*\.jpg/,
  );
  await page.locator("#gift-discard").click();
  assert.equal(await page.locator("#gift-photo-list button").count(), 0);
  assert.equal(
    await page.evaluate(() => photoFixture.session.getSelectedGift()),
    null,
  );
  assert.deepEqual(errors, []);
});

test("lab PHOTO GIFT retains selection and clears participant photos", async (t) => {
  const { page, errors } = await pageFor(t);
  await page.goto(base + "games/wind-tree/index.html");
  await page.evaluate(async () => {
    const { WindLab } = await import("./wind-lab.js");
    const root = document.querySelector("#windLab");
    root.classList.remove("hidden");
    document.querySelector("#app").classList.add("hidden");
    const lab = (window.labFixture = new WindLab({
      root,
      video: document.querySelector("#camera"),
      camera: { stop() {} },
      onExit() {},
    }));
    lab.setMode("KIDS");
    lab.play.photos.start("lab-browser-test");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    canvas.getContext("2d").fillRect(0, 0, 32, 32);
    lab.play.photos.add(
      await new Promise((r) => canvas.toBlob(r, "image/jpeg")),
      { quality: 1, elapsedSec: 1, smileScore: 0.8 },
      "lab-browser-test",
    );
    lab.play.photoUI.render();
    lab.$("#labResult").hidden = false;
  });
  await page.locator("#labPhotoConsent").check();
  await page.locator("#labGiftOpen").click();
  await page.locator("#gift-photo-list button").click();
  await page.waitForFunction(()=>labFixture.play.photos.selectedId!==null);
  assert.equal(
    await page.evaluate(() => labFixture.getSelectedGift().blob.type),
    "image/jpeg",
  );
  const downloaded = page.waitForEvent("download");
  await page.locator("#gift-format").selectOption("jpeg");
  await page.locator("#gift-save").click();
  assert.match(
    (await downloaded).suggestedFilename(),
    /kaze-ni-tatsu-.*\.jpg/,
  );
  await page.locator("#gift-back").click();
  await page.locator("#labResetPlay").click();
  assert.equal(await page.evaluate(() => labFixture.getSelectedGift()), null);
  assert.equal(await page.locator("#lab-photoGrid button").count(), 0);
  await page.evaluate(() => labFixture.dispose());
  assert.deepEqual(errors, []);
});

test("seesaw PC trial, PHOTO GIFT PNG export and next participant", async (t) => {
  const { page, errors } = await pageFor(t);
  await launch(page, "seesaw");
  await page.locator("#mode").selectOption("test");
  await page.locator("#center").click();
  await page.locator('[data-game-mode="SURVIVAL"]').click();
  await page.locator("#play-duration").fill("5");
  await page.locator("#start").click();
  await page.locator("#play").waitFor({ state: "visible" });
  await page.locator("#result").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#gift-open").click();
  await page.locator("#gift").waitFor({ state: "visible" });
  await page.locator("#gift-consent").check();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    c.getContext("2d").fillRect(0, 0, 32, 32);
    return c.toDataURL().split(",")[1];
  });
  await page.locator("#gift-file-smile").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page.waitForFunction(
    () => document.querySelector("#gift-file-smile").files.length === 0,
  );
  await page.locator("#gift-options-details > summary").click();
  await page.locator("#gift-layout").selectOption("D");
  const downloaded = page.waitForEvent("download");
  await page.locator("#gift-save").click();
  assert.match((await downloaded).suggestedFilename(), /\.png$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#new-participant").click();
  assert.equal(await page.locator("#gift").isVisible(), false);
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("kaze-ni-tatsu-playground:session"),
    ),
    null,
  );
  assert.deepEqual(errors, []);
});

test("continuous flow, random recycling and DIRECT HAND TEST move actual particles in every mode", async (t) => {
  const { page, errors } = await pageFor(t);
  await page.route("**/games/wind-tree/app.js*", async (route) => {
    const source = await readFile(
      resolve(site, "games/wind-tree/app.js"),
      "utf8",
    );
    await route.fulfill({
      contentType: "text/javascript",
      body:
        source +
        "\nwindow.flowAudit={get lab(){return labInstance},get pose(){return pose}};",
    });
  });
  await launch(page, "wind-tree");
  await page.locator("#windLabBtn").click();
  await page.waitForFunction(() => window.flowAudit?.lab?.engine);
  await page.getByRole("button", { name: "ALL OFF", exact: true }).click();
  await page.waitForTimeout(1400);
  assert.ok(
    await page.evaluate(() => flowAudit.lab.engine.motion.meanSpeed < 0.001),
  );
  await page.locator("#lab-ambient").check();
  await page.waitForFunction(
    () => flowAudit.lab.engine.motion.displacement1s > 0.2,
  );
  assert.ok(await page.evaluate(() => flowAudit.lab.engine.velocities[1] < 0));
  await page.locator("#lab-verticalFlow").selectOption("UP");
  await page.waitForFunction(() => flowAudit.lab.engine.velocities[1] > 0);
  await page.locator("#lab-verticalFlow").selectOption("DOWN");
  await page
    .getByRole("button", { name: "LEFT HAND ONLY", exact: true })
    .click();
  assert.equal(await page.locator("#lab-ambient").isChecked(), false);
  await page.locator("#labDirect").click();
  assert.equal(
    await page.locator("#labPc").getAttribute("aria-pressed"),
    "false",
  );
  for (const side of ["left", "right"]) {
    await page
      .getByRole("button", {
        name: side === "left" ? "LEFT HAND ONLY" : "RIGHT HAND ONLY",
        exact: true,
      })
      .click();
    await page.locator("#labDirectSide").selectOption(side);
    await page.evaluate(() => {
      const l = flowAudit.lab;
      l.engine.reset();
      l.field.rebuild();
    });
    const box = await page.locator(".lab-stage > canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.waitForTimeout(250);
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(
        box.x + box.width * (0.45 + i * 0.004),
        box.y + box.height * 0.5,
      );
      await page.waitForTimeout(35);
    }
    await page.mouse.up();
    const row = await page.evaluate((side) => {
      const l = flowAudit.lab,
        e = l.engine;
      return {
        side,
        wind: Math.hypot(...e[side].at(...e[side].position, e.config)),
        wrist: e[side].wristSpeed,
        ...e.motion,
      };
    }, side);
    assert.ok(row.displacement1s > 0.002);
    assert.ok(row[side + "Count"] > 0);
    console.log("DIRECT MEASURE", JSON.stringify(row));
  }
  await page.locator("#lab-ambient").check();
  await page.waitForTimeout(1600);
  assert.ok(
    await page.evaluate(() => flowAudit.lab.engine.motion.meanSpeed > 0.2),
  );
  for (const mode of ["DOT", "KIDS", "ART"]) {
    await page.locator("[data-mode=" + mode + "]").click();
    await page.locator(".lab-details").evaluate((e) => (e.open = true));
    await page.locator(".lab-tracking").evaluate((e) => (e.open = true));
    await page.waitForFunction(
      () => flowAudit.lab.engine.motion.meanSpeed > 0.2,
    );
    await rendered(page, "continuous-" + mode.toLowerCase());
  }
  await page.evaluate(() => {
    const l = flowAudit.lab,
      e = l.engine;
    e.positions[1] = -9.999;
    e.velocities[1] = -8;
    e.step(0.016);
    l.field.update();
  });
  assert.ok(await page.evaluate(() => flowAudit.lab.engine.generations[0] > 0));
  await page.locator("#labPc").click();
  await page.locator("#labPoseTest").selectOption("F");
  await page.waitForFunction(() =>
    flowAudit.lab.avatar.source.includes("SYNTHETIC"),
  );
  await page.locator("#labExit").click();
  assert.deepEqual(errors, []);
});

test("CAMERA ON uses real asynchronous PosePipeline with synthetic upper/full Pose and matching hand fields", async (t) => {
  const { page, errors } = await pageFor(t);
  let workers = 0;
  page.on("worker", (w) => {
    if (w.url().endsWith("pose-worker.js")) workers++;
  });
  await page.route("**/games/wind-tree/app.js*", async (route) => {
    const source = await readFile(
      resolve(site, "games/wind-tree/app.js"),
      "utf8",
    );
    await route.fulfill({
      contentType: "text/javascript",
      body:
        source +
        "\nwindow.cameraAudit={get lab(){return labInstance},get pose(){return pose},get stream(){return stream}};",
    });
  });
  await page.route("**/pose-worker.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `let mode='upper',sequence,begin;onmessage=async({data:d})=>{if(d.type==='init'){({poseSequence:sequence}=await import('./src/wind-lab/PoseSequences.js'));postMessage({type:'ready'});}if(d.type==='test'){mode=d.mode;}if(d.type==='frame'){begin??=d.timestamp;const aspect=d.bitmap.width/d.bitmap.height;const s=sequence('F',(d.timestamp-begin)/1000);for(let i=0;i<23;i++)s.landmarks[i].x+=Math.sin((d.timestamp-begin)/500)*.05;s.worldLandmarks=s.landmarks.map(p=>({...p,x:(p.x-.5)*2*aspect,y:(p.y-.62)*2,z:p.z*2*aspect}));if(mode==='upper'){for(let i=23;i<33;i++)s.landmarks[i].visibility=.05;s.worldLandmarks[13].x=NaN;}if(mode==='lost')s.landmarks=null;d.bitmap.close();setTimeout(()=>postMessage({type:'result',timestamp:d.timestamp,generation:d.generation,result:{landmarks:s.landmarks?[s.landmarks]:[],worldLandmarks:s.worldLandmarks?[s.worldLandmarks]:[]}}),25);}}`,
    }),
  );
  await page.route("https://**/*", (r) => r.abort());
  await launch(page, "wind-tree");
  await page.locator("#windLabBtn").click();
  await page.locator("#lab-avatar").check();
  await page.locator("#lab-handDebug").check();
  await page.locator("#labSkeleton").click();
  await page
    .getByRole("button", { name: "LEFT HAND ONLY", exact: true })
    .click();
  await page.locator("#labCamera").click();
  await page.waitForFunction(
    () =>
      cameraAudit.lab.avatar.trackingMode === "UPPER BODY" &&
      cameraAudit.lab.engine.motion.displacement1s > 0.005 &&
      Math.hypot(
        ...cameraAudit.lab.engine.left.at(
          ...cameraAudit.lab.engine.left.position,
          cameraAudit.lab.engine.config,
        ),
      ) > 0.1,
  );
  const upper = await page.evaluate(() => {
    const l = cameraAudit.lab;
    return {
      source: l.avatar.coordinateSource,
      valid: l.avatar.validCount,
      legs: l.avatar.valid.slice(23).some(Boolean),
      poseAge: l.avatar.poseAge,
      skeleton: l.skeletonPoints,
      wind: Math.hypot(
        ...l.engine.left.at(...l.engine.left.position, l.engine.config),
      ),
      ...l.engine.motion,
    };
  });
  assert.equal(upper.source, "NORMALIZED");
  await page.waitForFunction(() =>
    document.querySelector("#labDebug").textContent.includes("POSE DETECTED"),
  );
  assert.equal(upper.legs, false);
  assert.equal(upper.skeleton, 33);
  assert.ok(upper.poseAge < 500);
  console.log("CAMERA UPPER MEASURE", JSON.stringify(upper));
  await page.evaluate(()=>cameraAudit.pose.worker.postMessage({type:"test",mode:"full"}));
  await page.waitForFunction(()=>cameraAudit.lab.avatar.trackingMode==="FULL BODY");
  await page.evaluate(()=>{const l=cameraAudit.lab;l.apply({...l.engine.config,body:true,left:true,right:true,bodyDeadZone:0,ambient:false,weather:false});window.previewWorker=cameraAudit.pose.worker;window.previewStream=cameraAudit.stream;});
  const measure=()=>page.evaluate(()=>{const l=cameraAudit.lab;return {fps:l.diagnostics.poseFps,frames:l.diagnostics.poseFrames,video:l.video.currentTime,wrist:[...l.engine.left.position],body:Math.hypot(...l.engine.components.body),left:Math.hypot(...l.engine.components.left),right:Math.hypot(...l.engine.components.right),...l.engine.motion};});
  await page.waitForTimeout(1400);const beforePreview=await measure();
  await page.locator('#labPreview').click();await page.waitForTimeout(1600);const afterPreview=await measure();
  console.log('PREVIEW COMPARISON',JSON.stringify({before:beforePreview,after:afterPreview}));
  assert.ok(afterPreview.fps>5);assert.ok(afterPreview.video>beforePreview.video);assert.notDeepEqual(afterPreview.wrist,beforePreview.wrist);
  assert.ok(afterPreview.body>0);assert.ok(afterPreview.left>0);assert.ok(afterPreview.right>0);assert.ok(afterPreview.meanSpeed>.005&&afterPreview.displacement1s>.005);
  assert.ok(await page.evaluate(()=>cameraAudit.pose.worker===previewWorker&&cameraAudit.stream===previewStream&&!cameraAudit.lab.video.paused));
  assert.equal(await page.locator('#labCameraActive').isVisible(),true);assert.equal(await page.evaluate(()=>cameraAudit.lab.skeletonPoints),0);
  await page.locator('#labFullscreen').click();await page.waitForFunction(()=>cameraAudit.lab.fullscreen.active);await page.waitForTimeout(500);assert.ok(await page.evaluate(()=>cameraAudit.pose.worker===previewWorker&&cameraAudit.stream===previewStream&&cameraAudit.lab.cameraOn));await page.locator('#labFullscreen').click();await page.waitForFunction(()=>!cameraAudit.lab.fullscreen.active);
  await page.locator('#labPreview').click();await page.waitForFunction(()=>cameraAudit.lab.skeletonPoints===33);await page.locator('#labSkeleton').click();await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>cameraAudit.lab.skeletonPoints),0);await page.waitForFunction(()=>cameraAudit.lab.diagnostics.poseFps>5);assert.ok((await measure()).fps>5);await page.locator('#labSkeleton').click();
  await page.evaluate(()=>cameraAudit.pose.worker.postMessage({type:'test',mode:'upper'}));await page.waitForFunction(()=>cameraAudit.lab.avatar.trackingMode==='UPPER BODY');
  for (const size of [20, 100, 183, 300]) {
    await page.locator("#lab-avatarSize").fill(String(size));
    await page.waitForTimeout(400);
    assert.ok(
      await page.evaluate(() =>
        ["left", "right"].every((side) =>
          cameraAudit.lab.avatar
            .wrist(side)
            .every(
              (v, k) =>
                Math.abs(v - cameraAudit.lab.engine[side].position[k]) < 1e-5,
            ),
        ),
      ),
    );
  }
  await page.locator("#lab-avatarSize").fill("100");
  for (const mode of ["DOT", "KIDS", "ART"]) {
    await page.locator("[data-mode=" + mode + "]").click();
    await page.locator(".lab-details").evaluate((e) => (e.open = true));
    await page.locator(".lab-tracking").evaluate((e) => (e.open = true));
    await page.waitForFunction(() => cameraAudit.lab.avatar.group.visible);
    assert.ok(
      await page.evaluate(() => {
        const l = cameraAudit.lab;
        return ["left", "right"].every((side) =>
          l.avatar
            .wrist(side)
            .every((v, k) => Math.abs(v - l.engine[side].position[k]) < 1e-5),
        );
      }),
    );
    await rendered(page, "camera-upper-" + mode.toLowerCase());
  }
  await page.evaluate(() =>
    cameraAudit.pose.worker.postMessage({ type: "test", mode: "full" }),
  );
  await page.waitForFunction(
    () =>
      cameraAudit.lab.avatar.trackingMode === "FULL BODY" &&
      cameraAudit.lab.avatar.validCount === 33,
  );
  await page.waitForFunction(
    () => cameraAudit.lab.avatar.coordinateSource === "WORLD",
  );
  await page.evaluate(() =>
    cameraAudit.pose.worker.postMessage({ type: "test", mode: "lost" }),
  );
  await page.waitForFunction(() => !cameraAudit.lab.avatar.group.visible);
  await page.evaluate(() =>
    cameraAudit.pose.worker.postMessage({ type: "test", mode: "upper" }),
  );
  await page.waitForFunction(() => cameraAudit.lab.avatar.group.visible);
  await page.locator("#labDuration").fill("1");
  await page.locator("#labStartPlay").click();
  await page.evaluate(() => {
    window.finishedPose = cameraAudit.pose;
    window.finishedRenderer = cameraAudit.lab.renderer;
  });
  await page.waitForFunction(() => cameraAudit.lab.graphicsPaused);
  assert.equal(
    await page.evaluate(() => cameraAudit.lab.play.growth.phase),
    "finished",
  );
  assert.equal(await page.evaluate(() => cameraAudit.pose), null);
  assert.ok(
    await page.evaluate(
      () => finishedPose.closed && cameraAudit.lab.raf === null,
    ),
  );
  await page.waitForFunction(() =>
    finishedRenderer.getContext().isContextLost(),
  );
  assert.equal(await page.locator("#labResult").isVisible(), true);
  await page.locator("#labAgain").click();
  await page.waitForFunction(
    () =>
      !cameraAudit.lab.graphicsPaused &&
      cameraAudit.lab.renderer !== finishedRenderer,
  );
  await page.locator("#labPc").click();
  await page.locator("[data-mode=DOT]").click();
  await rendered(page, "after-finish-replay");
  assert.equal(workers, 1);
  await page.locator("#labCamera").click();
  await page.waitForFunction(
    () => cameraAudit.lab.cameraOn && cameraAudit.pose?.result.timestamp > 0,
  );
  assert.equal(workers, 2);
  const stopped = await page.evaluate(() => {
    window.closedLab = cameraAudit.lab;
    window.closedWorker = cameraAudit.pose;
    return cameraAudit.stream.getTracks().map((t) => t.readyState);
  });
  assert.ok(stopped.includes("live"));
  await page.locator("#labExit").click();
  assert.equal(await page.evaluate(() => cameraAudit.pose), null);
  assert.ok(
    await page.evaluate(
      () =>
        closedLab.disposed &&
        closedLab.scene.children.length === 0 &&
        closedWorker.closed,
    ),
  );
  assert.deepEqual(errors, []);
});

for (const sign of [-1, 1]) test(`seesaw actual PC TEST ${sign * 5}deg gain3 displays ${sign * 15}deg, moves and falls`, async t => {
  const {page,errors} = await pageFor(t);
  await launch(page, 'seesaw');
  await page.locator('#mode').selectOption('test'); await page.locator('#center').click();
  await page.locator('#device-tuning summary').click();
  await page.locator('#tuning-angleGain').fill('3');
  await page.locator('[data-game-mode="SURVIVAL"]').click();
  await page.locator('#play-duration').fill('30');
  await page.locator('#tilt').fill(String(sign*5));
  await page.waitForFunction(sign => document.querySelector('#tuning-live-game').textContent === `${sign > 0 ? '+' : '-'}15.0°`,sign);
  await page.locator('#start').click();
  await page.waitForFunction(sign => Math.abs(Number(document.querySelector('#platform').dataset.gameAngle) - sign*15)<.02,sign);
  const before=await page.locator('#egg').evaluate(e=>Number.parseFloat(e.style.left));
  await page.waitForFunction(({sign,before})=> (Number.parseFloat(document.querySelector('#egg').style.left)-before)*sign > 25,{sign,before});
  await page.screenshot({path:resolve(site,`../test-results/seesaw-gain3-${sign}.png`)});
  await page.locator('#result').waitFor({state:'visible',timeout:15000});
  const trial=await page.evaluate(()=>JSON.parse(localStorage.getItem('keep-the-egg:last-trial')));
  assert.equal(trial.summary.dropCount,1);
  assert.ok(trial.summary.survivalTime > 6 && trial.summary.survivalTime < 8);
  assert.ok(trial.samples.some(s=>Math.abs(s.gameAngle-sign*15)<.02 && Math.abs(s.relativeSensorAngle-sign*5)<.01));
  assert.ok(trial.samples.some(s=>s.eggPosition*sign>.9));
  console.log('BROWSER PC FALL', {angle:sign*5,gain:3,seconds:trial.summary.survivalTime,drops:trial.summary.dropCount});
  await page.locator('#research summary').click();
  const download=page.waitForEvent('download');await page.locator('#samples-csv').click();
  const csv=await readFile(await (await download).path(),'utf8');
  assert.match(csv,/"rawSensorAngle","relativeSensorAngle","gameAngle","angleGain","maxGameAngle","boardLength","objectResponse"/);
  const summaryDownload=page.waitForEvent('download');await page.locator('#summary-csv').click();
  const summaryCSV=await readFile(await (await summaryDownload).path(),'utf8');
  assert.match(summaryCSV,/"initialDeviceTuning"/);
  assert.ok(!summaryCSV.includes('[object Object]'));
  page.once('dialog',d=>d.accept());await page.locator('#result-new-participant').click();
  await page.waitForURL(base+'index.html');
  await page.goto(base+'games/seesaw/index.html');
  await page.waitForFunction(()=>document.body.dataset.appReady==='true');
  assert.equal(await page.locator('#tuning-angleGain').inputValue(),'3');
  await page.reload();await page.waitForFunction(()=>document.body.dataset.appReady==='true');
  assert.equal(await page.locator('#tuning-angleGain').inputValue(),'3');
  assert.deepEqual(errors,[]);
});

test('seesaw staff live clamp/length/response, narrow layout, storage and reset',async t=>{
  const {page,errors}=await pageFor(t);
  await launch(page,'seesaw');await page.locator('#mode').selectOption('test');await page.locator('#center').click();
  await page.locator('#device-tuning summary').click();
  await page.locator('#tuning-angleGain').fill('3');await page.locator('#tuning-maxGameAngle').fill('10');
  await page.locator('#tuning-boardLength').fill('70');await page.locator('#tuning-objectResponse').fill('2');
  await page.locator('#tilt').fill('5');await page.locator('#start').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='play');
  await page.locator('#pause').click();
  assert.equal(await page.locator('#tuning-live-game').textContent(),'+10.0°');
  for(const length of [25,50,70,100]){
    await page.locator('#tuning-boardLength').fill(String(length));
    const g=await page.evaluate(()=>({scene:document.querySelector('#scene').clientWidth,board:parseFloat(document.querySelector('#platform').style.width)}));
    assert.ok(Math.abs(g.board-g.scene*.7*length/100)<.01);
  }
  await page.locator('#tuning-maxGameAngle').fill('35');
  await page.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+15.0°');
  assert.equal(await page.locator('#platform').getAttribute('data-game-angle'),'15');
  await page.setViewportSize({width:390,height:844});
  const range=page.locator('#tuning-angleGain');await range.focus();await range.press('ArrowRight');
  assert.equal(await page.locator('#tilt').inputValue(),'5');
  await page.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+15.5°');
  await page.screenshot({path:resolve(site,'../test-results/seesaw-tuning-narrow.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.reload();await page.waitForFunction(()=>document.body.dataset.appReady==='true');
  for(const [key,value]of Object.entries({angleGain:'3.1',maxGameAngle:'35',boardLength:'100',objectResponse:'2'}))assert.equal(await page.locator('#tuning-'+key).inputValue(),value);
  await page.locator('#device-tuning summary').click();await page.locator('#tuning-reset').click();
  for(const [key,value]of Object.entries({angleGain:'1',maxGameAngle:'30',boardLength:'100',objectResponse:'1'}))assert.equal(await page.locator('#tuning-'+key).inputValue(),value);
  assert.deepEqual(errors,[]);
});

test('PHONE CONTROLLER UI/packet regression: host-only gain, remote center, live trial, disconnect/reconnect',async t=>{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(()=>{window.phoneCameraCalls=0;const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{phoneCameraCalls++;return get(options);};});
  const runtime=await readFile(resolve(import.meta.dirname,'fixtures/vision-smile.js'),'utf8');
  await context.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@**',r=>r.fulfill({body:runtime,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await context.route('**/vendor/peerjs-1.5.5.min.js',r=>r.fulfill({path:resolve(import.meta.dirname,'fixtures/local-peer.js'),contentType:'text/javascript'}));
  const host=await context.newPage(),errors=[];
  let phone;
  t.after(async()=>{
    if (!host.isClosed()) console.log('PHONE HOST STATE',await host.evaluate(()=>({hidden:document.hidden,phase:document.body.dataset.phase,status:document.querySelector('#status').textContent,pause:document.querySelector('#pause-reason').textContent,connection:document.querySelector('#connection-state').textContent})));
    if (phone && !phone.isDetached()) console.log('PHONE CONTROLLER STATE',await phone.evaluate(()=>({hidden:document.hidden,status:document.querySelector('#controller-sensor-state').textContent,host:document.querySelector('#controller-host-state').textContent})));
    await context.close();
  });
  host.on('pageerror',e=>errors.push(e.message));
  await host.goto(base+'games/seesaw/index.html');
  await host.waitForFunction(()=>document.body.dataset.appReady==='true');
  const link=await host.locator('#controller-link').getAttribute('href');
  // Keep both device UIs visible at once. A background headless tab can legitimately
  // throttle RAF >500ms and trigger the game's existing safety pause/countdown reset.
  await host.evaluate(url=>{
    document.querySelector('#host-app').style.margin='0';
    document.querySelector('#host-app').style.width='calc(100vw - 420px)';
    const iframe=document.createElement('iframe');iframe.id='controller-fixture';iframe.src=url;
    iframe.style.cssText='position:fixed;right:0;top:0;width:400px;height:100vh;border:0;z-index:10000';
    document.body.append(iframe);
  },link+'&controllerTest=1');
  phone=await (await host.locator('#controller-fixture').elementHandle()).contentFrame();
  await phone.waitForLoadState('domcontentloaded');
  await phone.locator('#controller-enable').click();await phone.locator('#controller-center').click();
  await host.waitForFunction(()=>!document.querySelector('#start').disabled);
  await host.locator('#device-tuning summary').click();await host.locator('#tuning-angleGain').fill('3');
  await phone.locator('#controller-test-tilt').fill('5');
  await host.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+15.0°');
  assert.equal(await phone.locator('#controller-gauge').getAttribute('aria-valuenow'),'5');
  await host.locator('#phone-center').click();
  await host.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+0.0°');
  await phone.locator('#controller-test-tilt').fill('0');
  await host.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='-15.0°');
  await phone.locator('#controller-center').click();
  await host.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+0.0°');
  await host.locator('#shared-photo-panel > summary').click();await host.locator('#photoConsent').check();
  await host.locator('[data-game-mode="SURVIVAL"]').click();await host.locator('#play-duration').fill('30');
  await host.locator('#start').click();await host.waitForFunction(()=>document.body.dataset.phase==='play');
  await phone.locator('#controller-test-tilt').fill('5');
  await host.waitForFunction(()=>Math.abs(Number(document.querySelector('#platform').dataset.gameAngle)-15)<.02);
  await host.waitForFunction(()=>document.querySelector('.shared-capture-status').textContent.includes('写真 1/5'));
  assert.equal(await host.evaluate(()=>phoneCameraCalls),1);assert.equal(await phone.evaluate(()=>phoneCameraCalls),0);
  await host.locator('#phone-retry').evaluate(b=>b.click());
  await host.locator('#pause-panel').waitFor({state:'visible'});
  await phone.locator('#controller-retry').click();
  await host.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('スマホ接続中'));
  assert.deepEqual(errors,[]);
});

test('LOCAL TILT gain and screen rotation safety; KEEP/STAR and sound controls remain usable',async t=>{
  const {page,errors}=await pageFor(t);
  await launch(page,'seesaw');
  await page.locator('#mode').selectOption('sensor');await page.locator('#connect').click();
  await page.evaluate(()=>{
    window.simAngle=0;
    window.sensorFixture=setInterval(()=>window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{beta:0,gamma:window.simAngle})),34);
  });
  await page.locator('#center').click();await page.locator('#device-tuning summary').click();
  await page.locator('#tuning-angleGain').fill('3');await page.evaluate(()=>{window.simAngle=5;});
  await page.waitForFunction(()=>document.querySelector('#tuning-live-game').textContent==='+15.0°');
  await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='play');
  await page.evaluate(()=>screen.orientation.dispatchEvent(new Event('change')));
  await page.locator('#pause-panel').waitFor({state:'visible'});
  assert.match(await page.locator('#pause-reason').textContent(),/向き/);
  await page.locator('#quit').click();await page.locator('#result').waitFor({state:'visible'});await page.locator('#again').click();await page.evaluate(()=>clearInterval(window.sensorFixture));
  await page.locator('#mode').selectOption('test');await page.locator('#center').click();
  await page.locator('#tuning-reset').click();
  await page.locator('#staff summary').click();
  await page.locator('#audio-alert').selectOption('bell');await page.locator('#audio-test').click();
  await page.locator('#audio-effects').uncheck();await page.locator('#audio-voice').uncheck();
  await page.locator('#play-duration').fill('5');
  for(const mode of ['KEEP','STAR']){
    await page.locator(`[data-game-mode="${mode}"]`).click();
    await page.locator('#start').click();await page.locator('#result').waitFor({state:'visible',timeout:15000});
    const trial=await page.evaluate(()=>JSON.parse(localStorage.getItem('keep-the-egg:last-trial')));
    assert.equal(trial.summary.gameMode,mode);assert.equal(trial.summary.dropCount,0);
    if(mode==='STAR')assert.equal(trial.summary.starCount,2);
    await page.locator('#again').click();await page.locator('#center').click();
  }
  assert.deepEqual(errors,[]);
});

async function auditCapture(page, {scheduled = false} = {}) {
  await page.addInitScript(scheduled => { if (!scheduled) localStorage.setItem("playground:photo-settings", JSON.stringify({...JSON.parse(localStorage.getItem("playground:photo-settings") || "{}"),scheduledEnabled:false})); }, scheduled);
  await page.addInitScript(()=>{
    window.cameraCalls=0;window.captureTracks=[];window.workerRecords=[];window.liveObjectURLs=new Set();
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async options=>{window.cameraCalls++;const stream=await get(options);window.captureTracks.push(...stream.getTracks());return stream;};
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{constructor(...args){super(...args);const record={url:String(args[0]),closed:false};window.workerRecords.push(record);const terminate=this.terminate.bind(this);this.terminate=()=>{record.closed=true;return terminate();};}};
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=value=>{const url=create(value);window.liveObjectURLs.add(url);return url;};URL.revokeObjectURL=url=>{window.liveObjectURLs.delete(url);revoke(url);};
  });
  const runtime=await readFile(resolve(import.meta.dirname,'fixtures/vision-smile.js'),'utf8');
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@**',r=>r.fulfill({body:runtime,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await page.route('**/games/seesaw/src/app.js*',async r=>r.fulfill({body:await readFile(resolve(site,'games/seesaw/src/app.js'),'utf8')+'\nwindow.sharedAudit={get photos(){return sharedCapture.photos},get face(){return sharedCapture.face}};',contentType:'text/javascript'}));
  await page.route('**/games/wind-tree/app.js*',async r=>r.fulfill({body:await readFile(resolve(site,'games/wind-tree/app.js'),'utf8')+'\nwindow.sharedAudit={get photos(){return photos},get face(){return faceCapture}};',contentType:'text/javascript'}));
}

for(const game of ['seesaw','wind-tree'])test(`shared smile shutter, common gallery/editor/JPEG/PNG/drawing and complete participant cleanup: ${game}`,async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page);await launch(page,game);
  if(game==='seesaw'){
    await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('10');await page.locator('#shared-photo-panel > summary').click();
  }else{await page.locator('#durationNumber').fill('8');await page.locator('#homeDetails > summary').click();}
  assert.equal(await page.locator('#smileThreshold').inputValue(),'60');
  assert.equal(await page.locator('[data-setting=maxPhotos]').inputValue(),'5');
  await page.locator('[data-setting=maxPhotos]').fill('2');await page.locator('#photoConsent').check();
  await page.locator(game==='seesaw'?'#start':'#startBtn').click();
  await page.waitForFunction(()=>sharedAudit.photos.photos.length===2,{},{timeout:20000});
  await page.locator(game==='seesaw'?'#result':'#finish').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.evaluate(()=>cameraCalls),1,'Face must reuse Pose video or acquire one host camera only');
  const capture=await page.evaluate(()=>({photos:sharedAudit.photos.photos.map(p=>({elapsed:p.elapsedSec,score:p.smileScore})),workers:workerRecords,tracks:captureTracks.map(t=>t.readyState)}));
  assert.equal(capture.photos.length,2);assert.ok(capture.photos[1].elapsed-capture.photos[0].elapsed>=3);assert.ok(capture.photos.every(p=>p.score>=.6));assert.ok(capture.workers.every(w=>w.closed));assert.ok(capture.tracks.every(s=>s==='ended'));
  await page.locator(game==='seesaw'?'#gift-open':'#wind-gift-open').click();
  assert.equal(await page.locator('#gift-photo-list button').count(),2);
  await page.locator('#gift-photo-list button').first().click();
  await page.waitForFunction(()=>document.querySelector('#gift-photo-list button').getAttribute('aria-pressed')==='true');
  await page.locator('#gift-options-details > summary').click();
  await page.locator('#gift-layout').selectOption('D');await page.locator('#gift-zoom-smile').fill('2');await page.locator('#gift-x-smile').fill('0.5');await page.locator('#gift-frame').selectOption('nature');
  await page.locator('#gift-event-details > summary').click();
  await page.locator('#gift-event-name').fill('風に立つ テスト');await page.locator('#gift-event-date').fill('2026-10-18');await page.locator('#gift-event-location').fill('テスト会場');
  await page.waitForFunction(()=>!document.querySelector('#gift-save').disabled);
  const before=await page.locator('#gift-canvas').evaluate(c=>c.toDataURL());
  await page.locator('#gift-drawing-details > summary').click();
  await page.locator('#gift-draw-enabled').check();await page.locator('#gift-draw-layer').scrollIntoViewIfNeeded();
  const b=await page.locator('#gift-draw-layer').boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.5+40,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('#gift-save').disabled);
  assert.notEqual(await page.locator('#gift-canvas').evaluate(c=>c.toDataURL()),before);
  for(const format of ['png','jpeg']){
    await page.locator('#gift-format').selectOption(format);const download=page.waitForEvent('download');await page.locator('#gift-save').click();const saved=await download;const bytes=await readFile(await saved.path());
    if(format==='png')assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);else assert.deepEqual([...bytes.subarray(0,2)],[255,216]);
  }
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:resolve(site,`../test-results/shared-gift-${game}-${width}.png`),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>/data:image|blob:/.test(v))),false);
  await page.waitForFunction(()=>liveObjectURLs.size===2);
  let cleanup;
  page.on('console',m=>{if(m.text().startsWith('PHOTO_CLEANUP '))cleanup=JSON.parse(m.text().slice(14));});
  await page.evaluate(()=>addEventListener('pagehide',()=>console.log('PHOTO_CLEANUP '+JSON.stringify({photos:sharedAudit.photos.photos.length,urls:liveObjectURLs.size,workers:workerRecords.every(w=>w.closed),tracks:captureTracks.every(t=>t.readyState==='ended')}))));
  if(game==='seesaw')page.once('dialog',d=>d.accept());
  await page.locator('#new-participant').click();await page.waitForURL(base+'index.html');
  assert.deepEqual(cleanup,{photos:0,urls:0,workers:true,tracks:true});
  await page.goto(base+`games/${game}/index.html`);await page.locator('#photoConsent').waitFor({state:'attached'});
  assert.equal(await page.locator('#photoConsent').isChecked(),false);assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playground:photo-settings')).eventName),'風に立つ テスト');
  assert.deepEqual(errors,[]);
});

test('seesaw BODY shares one camera between Pose and Face and consent revocation stops capture',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page);await launch(page,'seesaw');
  await page.locator('#mode').selectOption('body');await page.locator('#connect').click();await page.locator('#center').click();
  await page.locator('#shared-photo-panel > summary').click();await page.locator('#photoConsent').check();await page.locator('#play-duration').fill('15');await page.locator('#start').click();
  await page.waitForFunction(()=>sharedAudit.photos.photos.length>0,{},{timeout:15000});
  assert.equal(await page.evaluate(()=>cameraCalls),1);
  await page.locator('#photoConsent').uncheck();
  assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);
  assert.ok(await page.evaluate(()=>workerRecords.filter(w=>w.url.includes('face-worker')).every(w=>w.closed)));
  assert.ok(await page.evaluate(()=>captureTracks.some(t=>t.readyState==='live')),'BODY Pose keeps its shared camera while playing without photos');
  await page.locator('#pause').click();await page.locator('#quit').click();await page.locator('#result').waitFor({state:'visible'});await page.locator('#again').click();await page.locator('#mode').selectOption('test');
  assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')));
  assert.deepEqual(errors,[]);
});

test('no consent never starts Face/camera; camera denial falls back without blocking either game',async t=>{
  for(const game of ['seesaw','wind-tree']){
    const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});
    await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{window.cameraCalls++;throw new DOMException('Denied','NotAllowedError');};});
    await launch(page,game);
    if(game==='seesaw'){await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('5');}
    else await page.locator('#durationNumber').fill('1');
    await page.locator(game==='seesaw'?'#start':'#startBtn').click();await page.locator(game==='seesaw'?'#result':'#finish').waitFor({state:'visible',timeout:15000});
    assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);assert.ok(await page.evaluate(()=>workerRecords.every(w=>!w.url.includes('face-worker'))));
    if(game==='seesaw')assert.equal(await page.evaluate(()=>cameraCalls),0);
    else assert.match(await page.locator('#photoStatus').textContent(),/PCテスト/);
    assert.deepEqual(errors,[]);
  }
});

test('shared QR transfer authenticates, retries, delivers exact PNG, previews/saves/shares and disposes connections',async t=>{
  const context=await browser.newContext({viewport:{width:1800,height:1100}});t.after(()=>context.close());
  await context.route('**/vendor/peerjs-1.5.5.min.js',r=>r.fulfill({path:resolve(import.meta.dirname,'fixtures/local-peer.js'),contentType:'text/javascript'}));
  await context.addInitScript(()=>{Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async({files})=>{window.sharedFiles=files.map(f=>({type:f.type,size:f.size}));},configurable:true});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await launch(page,'seesaw');await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('5');await page.locator('#start').click();await page.locator('#result').waitFor({state:'visible',timeout:15000});await page.locator('#gift-open').click();
  await page.locator('#gift-consent').check();await page.locator('#gift-send').click();await page.locator('#gift-link').waitFor({state:'visible'});
  const url=await page.locator('#gift-link').getAttribute('href'),parsed=new URL(url);
  assert.equal(parsed.pathname,new URL(base).pathname+'games/seesaw/index.html');assert.deepEqual([...parsed.searchParams.keys()],['gift','token']);assert.equal(parsed.searchParams.get('token').length,64);assert.ok(url.length<400);assert.ok(!url.includes('data:image'));
  assert.equal(await page.locator('#gift-qr canvas, #gift-qr img').count()>0,true);
  await page.evaluate(url=>{const frame=document.createElement('iframe');frame.id='gift-receiver-fixture';frame.src=url;frame.style.cssText='position:fixed;right:0;top:0;width:400px;height:100vh;z-index:20000;background:white';document.body.append(frame);},url.replace(parsed.searchParams.get('token'),'b'.repeat(64)));
  let phone=await(await page.locator('#gift-receiver-fixture').elementHandle()).contentFrame();
  await phone.waitForFunction(()=>document.querySelector('#receive-status').textContent.includes('中断'));
  assert.equal(await phone.locator('#receive-save').isVisible(),false);
  await page.locator('#gift-receiver-fixture').evaluate((frame,url)=>{frame.src=url;},url);
  phone=await(await page.locator('#gift-receiver-fixture').elementHandle()).contentFrame();
  await phone.waitForFunction(()=>document.querySelector('#receive-status').textContent.includes('届きました'),{},{timeout:15000});
  assert.deepEqual(await phone.locator('#receive-image').evaluate(image=>[image.naturalWidth,image.naturalHeight]),[1080,1620]);
  const received=await phone.locator('#receive-image').evaluate(async image=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(image.src)).arrayBuffer()))));
  const expected=await page.locator('#gift-canvas').evaluate(async c=>{const b=await new Promise(r=>c.toBlob(r,'image/png'));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())));});
  assert.deepEqual(received,expected);
  const download=page.waitForEvent('download');await phone.locator('#receive-save').click();assert.match((await download).suggestedFilename(),/\.png$/);
  await phone.locator('#receive-share').click();assert.equal(await phone.evaluate(()=>sharedFiles[0].type),'image/png');
  await phone.locator('#receive-discard').click();assert.equal(await phone.locator('#receive-save').isVisible(),false);assert.equal(await phone.locator('#receive-image').getAttribute('src'),null);
  assert.ok(await phone.evaluate(()=>localPeers.every(p=>p.destroyed)));
  await page.locator('#gift-transfer-stop').click();
  assert.ok(await page.evaluate(()=>localPeers.every(p=>p.destroyed)));
  assert.equal(await page.locator('#gift-link').getAttribute('href'),null);
  assert.deepEqual(errors,[]);
});

test('live threshold and capture ON/OFF preserve cooldown, never overlap cameras, and PHOTO GIFT OFF hides entry',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page);await launch(page,'seesaw');
  await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('30');await page.locator('#shared-photo-panel > summary').click();
  await page.locator('#smileThreshold').fill('100');await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='play');await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);
  await page.locator('#smileThreshold').fill('10');await page.waitForFunction(()=>sharedAudit.photos.photos.length===1,{},{timeout:6000});
  const first=await page.evaluate(()=>sharedAudit.photos.photos[0].elapsedSec);
  await page.locator('#smileEnabled').uncheck();assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')));assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),1);
  await page.locator('#smileEnabled').check();await page.waitForFunction(()=>sharedAudit.photos.photos.length===2,{},{timeout:8000});
  assert.ok(await page.evaluate(first=>sharedAudit.photos.photos[1].elapsedSec-first>=3,first));
  assert.equal(await page.evaluate(()=>cameraCalls),2);assert.equal(await page.evaluate(()=>captureTracks.filter(t=>t.readyState==='live').length),1);
  await page.locator('#photoConsent').uncheck();assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')));
  await page.locator('[data-setting=giftEnabled]').uncheck();assert.equal(await page.locator('#gift-open').evaluate(e=>e.hidden),true);
  await page.locator('#pause').click();await page.locator('#quit').click();assert.deepEqual(errors,[]);
});

test('Face model failure releases host camera/worker and the game still finishes with PHOTO GIFT available',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page);
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@**',r=>r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:"export const FilesetResolver={forVisionTasks:async()=>({})};export const FaceLandmarker={createFromOptions:async()=>{throw Error('synthetic model failure')}};"}));
  await launch(page,'seesaw');await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('5');await page.locator('#shared-photo-panel > summary').click();await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.waitForFunction(()=>cameraCalls===1&&workerRecords.some(w=>w.url.includes('face-worker'))&&workerRecords.every(w=>w.closed)&&captureTracks.every(t=>t.readyState==='ended'));
  await page.locator('#result').waitFor({state:'visible',timeout:15000});assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);assert.equal(await page.locator('#gift-open').isVisible(),true);assert.deepEqual(errors,[]);
});

test('seesaw emoji-only objects ignore legacy style and keep custom image import, plus 25% physical fall',async t=>{
  const {page,errors}=await pageFor(t);
  await page.addInitScript(()=>localStorage.setItem('keep-the-egg:object-style','svg'));
  await launch(page,'seesaw');
  assert.equal(await page.locator('#object-style').count(),0);
  for(const type of ['EGG','SOCCER_BALL','BASKETBALL','APPLE','CHICK','PEAR','CHESTNUT','MAPLE','LEAF','PUMPKIN','MUSHROOM']){
    const choice=page.locator(`[data-object="${type}"]`);await choice.click();
    assert.equal(await choice.locator('svg').count(),0);assert.equal(await choice.locator('[role=img]').count(),1);
  }
  assert.equal(await page.locator('[data-object="IMAGE_FILE"]').count(),1);assert.equal(await page.locator('[data-object="IMAGE_CAMERA"]').count(),1);
  await page.locator('#shared-photo-panel > summary').click();await page.locator('#photoConsent').check();
  await page.locator('[data-object="IMAGE_FILE"]').click();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=30;c.getContext('2d').fillRect(0,0,30,30);return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'custom.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#crop-controls').waitFor({state:'visible'});await page.locator('#use-image').click();
  await page.waitForFunction(()=>document.querySelector('[data-object="IMAGE_FILE"] img'));
  await page.locator('[data-object="EGG"]').click();await page.locator('#mode').selectOption('test');await page.locator('#center').click();
  await page.locator('#device-tuning summary').click();
  assert.equal(await page.locator('#tuning-boardLength').getAttribute('min'),'25');assert.equal(await page.locator('#tuning-boardLength').getAttribute('max'),'100');
  await page.locator('#tuning-boardLength').fill('25');await page.locator('#tuning-angleGain').fill('3');await page.locator('#tilt').fill('5');
  await page.locator('[data-game-mode="SURVIVAL"]').click();await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='play');
  const geometry=await page.evaluate(()=>({scene:document.querySelector('#scene').clientWidth,board:parseFloat(document.querySelector('#platform').style.width)}));
  await page.locator('#result').waitFor({state:'visible',timeout:15000});
  const data=await page.evaluate(()=>({trial:JSON.parse(localStorage.getItem('keep-the-egg:last-trial')),scene:document.querySelector('#scene').clientWidth,board:parseFloat(document.querySelector('#platform').style.width)}));
  assert.equal(data.trial.summary.dropCount,1);assert.equal(data.trial.summary.boardLength,.25);assert.ok(data.trial.summary.survivalTime<3);assert.ok(Math.abs(geometry.board-geometry.scene*.7*.25)<.01);assert.equal(data.trial.metadata.objectStyle,'emoji');assert.deepEqual(errors,[]);
});

test('scheduled-only 30s capture pauses with the game, saves all four including final, and cleans up through PHOTO GIFT',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});await launch(page,'seesaw');
  await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('30');
  await page.locator('#shared-photo-panel > summary').click();assert.equal(await page.locator('[data-setting=scheduledEnabled]').isChecked(),true);
  await page.locator('#smileEnabled').uncheck();await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='play');assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);
  await page.locator('#pause').click();await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);await page.locator('#resume').click();
  await page.locator('#result').waitFor({state:'visible',timeout:40000});
  const result=await page.evaluate(()=>({photos:sharedAudit.photos.photos.map(p=>({reason:p.reason,planned:p.scheduledSec,actual:p.elapsedSec})),calls:cameraCalls,workers:workerRecords,ended:captureTracks.every(t=>t.readyState==='ended')}));
  assert.equal(result.photos.length,4);assert.deepEqual(result.photos.map(p=>p.planned),[7.5,15,22.5,30]);assert.ok(result.photos.every(p=>p.reason==='scheduled'&&Math.abs(p.actual-p.planned)<.1));assert.equal(result.calls,1);assert.equal(result.workers.length,0);assert.equal(result.ended,true);
  await page.locator('#gift-open').click();assert.equal(await page.locator('#gift-photo-list button').count(),4);assert.match(await page.locator('#gift-photo-list').textContent(),/定時撮影/);await page.locator('#gift-photo-list button').last().click();
  for(const format of ['png','jpeg']){await page.locator('#gift-format').selectOption(format);await page.waitForFunction(()=>!document.querySelector('#gift-save').disabled);const d=page.waitForEvent('download');await page.locator('#gift-save').click();const bytes=await readFile(await (await d).path());assert.ok(bytes.length>1000);}
  await page.screenshot({path:resolve(site,'../test-results/seesaw-scheduled-gift.png'),fullPage:true});
  let cleared;page.on('console',m=>{if(m.text().startsWith('SCHEDULE_CLEANUP '))cleared=JSON.parse(m.text().slice(17));});
  await page.evaluate(()=>addEventListener('pagehide',()=>console.log('SCHEDULE_CLEANUP '+JSON.stringify({photos:sharedAudit.photos.photos.length,urls:liveObjectURLs.size}))));
  page.once('dialog',d=>d.accept());await page.locator('#new-participant').click();await page.waitForURL(base+'index.html');assert.deepEqual(cleared,{photos:0,urls:0});assert.deepEqual(errors,[]);
});

test('20s scheduled four plus five smile extras coexist and use one host camera despite smile cap',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});await launch(page,'seesaw');
  await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('20');await page.locator('#shared-photo-panel > summary').click();
  await page.locator('#shared-photo-settings details > summary').click();await page.locator('[data-setting=cooldownSeconds]').fill('1');await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.locator('#result').waitFor({state:'visible',timeout:30000});
  const result=await page.evaluate(()=>({smiles:sharedAudit.photos.count(),scheduled:sharedAudit.photos.count('scheduled'),times:sharedAudit.photos.photos.filter(p=>p.reason==='scheduled').map(p=>p.scheduledSec),total:sharedAudit.photos.photos.length,calls:cameraCalls,ended:captureTracks.every(t=>t.readyState==='ended'),closed:workerRecords.every(w=>w.closed)}));
  assert.equal(result.smiles,5);assert.equal(result.scheduled,4);assert.equal(result.total,9);assert.deepEqual(result.times,[5,10,15,20]);assert.equal(result.calls,1);assert.ok(result.ended&&result.closed);
  await page.locator('#gift-open').click();assert.equal(await page.locator('#gift-photo-list button').count(),9);assert.match(await page.locator('#gift-photo-list').textContent(),/笑顔撮影/);assert.deepEqual(errors,[]);
});

test('early quit preserves due photos, cancels future slots and releases camera before result',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});await launch(page,'seesaw');
  await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('20');await page.locator('#shared-photo-panel > summary').click();await page.locator('#smileEnabled').uncheck();await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.waitForFunction(()=>sharedAudit.photos.count('scheduled')===1,{},{timeout:15000});await page.locator('#pause').click();await page.locator('#quit').click();await page.locator('#result').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),1);assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')));await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),1);await page.locator('#gift-open').click();assert.equal(await page.locator('#gift-photo-list button').count(),1);assert.deepEqual(errors,[]);
});

test('Face initialization failure does not block four scheduled photos',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@**',r=>r.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:"export const FilesetResolver={forVisionTasks:async()=>({})};export const FaceLandmarker={createFromOptions:async()=>{throw Error('synthetic model failure')}};"}));
  await launch(page,'seesaw');await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('5');await page.locator('#shared-photo-panel > summary').click();await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.locator('#result').waitFor({state:'visible',timeout:15000});assert.equal(await page.evaluate(()=>sharedAudit.photos.count('scheduled')),4);assert.equal(await page.evaluate(()=>sharedAudit.photos.count()),0);assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')&&workerRecords.every(w=>w.closed)));assert.deepEqual(errors,[]);
});

test('scheduled count UI selects and persists 1..10; ten evenly spaced photos and one final photo reach PHOTO GIFT',async t=>{
  const {page,errors}=await pageFor(t);await auditCapture(page,{scheduled:true});await launch(page,'seesaw');
  await page.locator('#shared-photo-panel > summary').click();
  const count=page.locator('[data-setting=scheduledCount]');assert.equal(await count.inputValue(),'4');
  for(let n=1;n<=10;n++){await count.fill(String(n));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playground:photo-settings')).scheduledCount),n);}
  await page.reload();await page.waitForFunction(()=>document.body.dataset.appReady==='true');await page.locator('#shared-photo-panel > summary').click();assert.equal(await count.inputValue(),'10');
  await page.locator('#smileEnabled').uncheck();await page.locator('#mode').selectOption('test');await page.locator('#center').click();await page.locator('#play-duration').fill('5');await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.locator('#result').waitFor({state:'visible',timeout:15000});
  assert.deepEqual(await page.evaluate(()=>sharedAudit.photos.photos.map(p=>p.scheduledSec)),[.5,1,1.5,2,2.5,3,3.5,4,4.5,5]);
  assert.ok(await page.evaluate(()=>captureTracks.every(t=>t.readyState==='ended')));await page.locator('#gift-open').click();assert.equal(await page.locator('#gift-photo-list button').count(),10);
  await page.locator('#gift-back').click();await page.locator('#again').click();await count.fill('1');await page.locator('#center').click();await page.locator('#photoConsent').check();await page.locator('#start').click();
  await page.waitForFunction(()=>document.body.dataset.phase==='play');await page.waitForTimeout(2000);assert.equal(await page.evaluate(()=>sharedAudit.photos.photos.length),0);
  await page.locator('#result').waitFor({state:'visible',timeout:10000});assert.deepEqual(await page.evaluate(()=>sharedAudit.photos.photos.map(p=>p.scheduledSec)),[5]);assert.deepEqual(errors,[]);
});

test('WIND LAB native/CSS fullscreen, Esc/back/rotation and compact bars preserve state and orbit gestures',async t=>{
  const {page,errors}=await pageFor(t);
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/games/wind-tree/app.js*',async r=>r.fulfill({contentType:'text/javascript',body:await readFile(resolve(site,'games/wind-tree/app.js'),'utf8')+'\nwindow.fullLab=()=>labInstance;'}));
  await launch(page,'wind-tree');await page.locator('#windLabBtn').click();await page.waitForFunction(()=>!!fullLab());
  await page.evaluate(()=>{window.savedLab=fullLab();window.savedEngine=savedLab.engine;window.savedControls=savedLab.controls;savedLab.setMode("KIDS");savedLab.$("#labDuration").value="60";savedLab.play.start();window.savedGrowth=savedLab.play.growth;savedLab.play.photos.start('preserved');savedLab.engine.configure({...savedLab.engine.config,bodySensitivity:123});});
  let previousElapsed=0;
  const check=async()=>{const elapsed=await page.evaluate(()=>fullLab().play.growth.elapsedMs);assert.ok(elapsed>=previousElapsed);previousElapsed=elapsed;await page.waitForFunction(()=>{const l=fullLab();return Math.abs(l.view.aspect-l.stage.clientWidth/l.stage.clientHeight)<.001&&l.renderer.domElement.width>0;});assert.ok(await page.evaluate(()=>fullLab()===savedLab&&fullLab().engine===savedEngine&&fullLab().controls===savedControls&&fullLab().play.photos.trialId==='preserved'&&fullLab().engine.config.bodySensitivity===123&&fullLab().play.growth===savedGrowth&&savedGrowth.phase==='playing')); };
  await page.locator('#labFullscreen').click();await page.waitForFunction(()=>fullLab().fullscreen.active);await check();
  console.log('FULLSCREEN API',await page.evaluate(()=>({supported:!!document.documentElement.requestFullscreen,native:!!document.fullscreenElement})));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!fullLab().fullscreen.active);await check();
  await page.evaluate(()=>{fullLab().root.requestFullscreen=undefined;fullLab().root.webkitRequestFullscreen=undefined;});
  for(const [width,height] of [[1440,1000],[390,844],[844,390],[412,915]]){
    await page.setViewportSize({width,height});await page.locator('#labFullscreen').click();await page.waitForFunction(()=>fullLab().fullscreen.active);await check();
    for(const id of ['labCamera','labPreview','labSkeleton','labFullscreen','labExit']){const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,id);}
    await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));await check();
    await page.screenshot({path:resolve(site,`../test-results/lab-fullscreen-${width}-${height}.png`)});
    await page.goBack();await page.waitForFunction(()=>!fullLab().fullscreen.active);await check();
  }
  await page.evaluate(()=>{fullLab().root.requestFullscreen=()=>Promise.reject(Error('denied'));});await page.locator('#labFullscreen').click();await page.waitForFunction(()=>fullLab().fullscreen.active);
  const canvas=page.locator('.lab-stage > canvas'),b=await canvas.boundingBox();const before=await page.evaluate(()=>fullLab().view.position.toArray());
  await page.mouse.move(b.x+b.width*.4,b.y+b.height*.4);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(300);assert.notDeepEqual(await page.evaluate(()=>fullLab().view.position.toArray()),before);
  const cdp=await page.context().newCDPSession(page);const distance=await page.evaluate(()=>fullLab().view.position.distanceTo(fullLab().controls.target));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.4,y:b.y+b.height*.5,id:0},{x:b.x+b.width*.6,y:b.y+b.height*.5,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width*.25,y:b.y+b.height*.5,id:0},{x:b.x+b.width*.75,y:b.y+b.height*.5,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);
  assert.ok(Math.abs(await page.evaluate(()=>fullLab().view.position.distanceTo(fullLab().controls.target))-distance)>.1);
  await page.locator('#labFullscreen').click();await page.waitForFunction(()=>!fullLab().fullscreen.active);await page.locator('#labExit').click();await page.locator('#windLabBtn').waitFor({state:'visible'});assert.deepEqual(errors,[]);
});
