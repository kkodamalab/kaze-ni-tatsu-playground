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
  });
  await page.locator("#photoGrid button").click();
  await page.locator("#choosePhotoBtn").click();
  assert.equal(
    await page.evaluate(() => photoFixture.session.getSelectedGift().blob.type),
    "image/jpeg",
  );
  const downloaded = page.waitForEvent("download");
  await page.locator("#savePhotoBtn").click();
  assert.match(
    (await downloaded).suggestedFilename(),
    /wind-tree-browser-test-.*\.jpg/,
  );
  await page.locator("#deletePhotoBtn").click();
  assert.equal(await page.locator("#photoGrid button").count(), 0);
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
  await page.locator("#lab-photoGrid button").click();
  await page.locator("#lab-choosePhotoBtn").click();
  assert.equal(
    await page.evaluate(() => labFixture.getSelectedGift().blob.type),
    "image/jpeg",
  );
  const downloaded = page.waitForEvent("download");
  await page.locator("#lab-savePhotoBtn").click();
  assert.match(
    (await downloaded).suggestedFilename(),
    /wind-tree-lab-browser-test/,
  );
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
  await page.route("**/games/wind-tree/app.js", async (route) => {
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
  await page.route("**/games/wind-tree/app.js", async (route) => {
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
      body: `let mode='upper',sequence,begin;onmessage=async({data:d})=>{if(d.type==='init'){({poseSequence:sequence}=await import('./src/wind-lab/PoseSequences.js'));postMessage({type:'ready'});}if(d.type==='test'){mode=d.mode;}if(d.type==='frame'){begin??=d.timestamp;const aspect=d.bitmap.width/d.bitmap.height;const s=sequence('F',(d.timestamp-begin)/1000);s.worldLandmarks=s.landmarks.map(p=>({...p,x:(p.x-.5)*2*aspect,y:(p.y-.62)*2,z:p.z*2*aspect}));if(mode==='upper'){for(let i=23;i<33;i++)s.landmarks[i].visibility=.05;s.worldLandmarks[13].x=NaN;}if(mode==='lost')s.landmarks=null;d.bitmap.close();setTimeout(()=>postMessage({type:'result',timestamp:d.timestamp,generation:d.generation,result:{landmarks:s.landmarks?[s.landmarks]:[],worldLandmarks:s.worldLandmarks?[s.worldLandmarks]:[]}}),25);}}`,
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
