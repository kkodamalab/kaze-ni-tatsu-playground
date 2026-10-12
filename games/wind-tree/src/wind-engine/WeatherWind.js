import { windFromBearing, zero } from "./CoordinateMapper.js";
export const WEATHER_INTERVAL = 10 * 60 * 1000;
export class WeatherWind {
  constructor({
    fetcher = (...args) => globalThis.fetch(...args),
    geolocation = globalThis.navigator?.geolocation,
    onChange = () => {},
  } = {}) {
    this.fetcher = fetcher;
    this.geolocation = geolocation;
    this.onChange = onChange;
    this.value = zero();
    this.target = zero();
    this.mode = "SIMULATED WIND";
    this.data = null;
    this.location = null;
    this.status = "シミュレーション";
    this.generation = 0;
    this.requestId = 0;
  }
  notify() {
    this.onChange(this);
  }
  simulated(direction, speed) {
    this.cancel();
    this.mode = "SIMULATED WIND";
    this.location = null;
    this.data = { direction, speed };
    this.target = windFromBearing(direction, speed);
    this.status = "シミュレーション";
    this.notify();
  }
  cancel() {
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
    this.controller?.abort();
  }
  async gps() {
    this.cancel();
    this.location = null;
    this.data = null;
    this.target = zero();
    const token = this.generation;
    this.mode = "GPS WEATHER";
    this.status = "位置情報の許可を待っています";
    this.notify();
    if (!this.geolocation) {
      this.fail("位置情報を利用できません");
      return;
    }
    try {
      const pos = await new Promise((resolve, reject) =>
        this.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 600000,
        }),
      );
      if (token !== this.generation) return;
      this.location = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        acquiredAt: new Date(pos.timestamp).toISOString(),
      };
      await this.refresh(token);
      if (token === this.generation) this.schedule(token);
    } catch (e) {
      if (token === this.generation)
        this.fail("位置情報を取得できません。シミュレーションを利用できます");
    }
  }
  async manual(latitude, longitude) {
    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    ) {
      this.status = "緯度・経度の範囲を確認してください";
      this.notify();
      return;
    }
    this.cancel();
    this.data = null;
    this.target = zero();
    this.mode = "MANUAL LOCATION";
    this.location = {
      latitude,
      longitude,
      acquiredAt: new Date().toISOString(),
    };
    const token = this.generation;
    await this.refresh(token);
    if (token === this.generation) this.schedule(token);
  }
  schedule(token) {
    this.timer = setInterval(() => this.refresh(token), WEATHER_INTERVAL);
  }
  fail(message) {
    this.status = message;
    this.target = zero();
    this.data = null;
    this.notify();
  }
  async refresh(token = this.generation) {
    if (!this.location || token !== this.generation) return;
    const requestId = ++this.requestId;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    this.status = "気象データを取得しています";
    this.notify();
    try {
      const query = new URLSearchParams({
        latitude: String(this.location.latitude),
        longitude: String(this.location.longitude),
        current: "wind_speed_10m,wind_direction_10m",
        wind_speed_unit: "ms",
        timezone: "auto",
      });
      const response = await this.fetcher(
        "https://api.open-meteo.com/v1/forecast?" + query,
        { signal: controller.signal },
      );
      if (!response.ok) throw Error("HTTP " + response.status);
      const json = await response.json();
      const current = json.current;
      if (
        !Number.isFinite(current?.wind_speed_10m) ||
        current.wind_speed_10m < 0 ||
        !Number.isFinite(current.wind_direction_10m) ||
        current.wind_direction_10m < 0 ||
        current.wind_direction_10m > 360 ||
        typeof current.time !== "string" ||
        json.current_units?.wind_speed_10m !== "m/s"
      )
        throw Error("invalid weather response");
      if (token !== this.generation || requestId !== this.requestId) return;
      this.data = {
        speed: current.wind_speed_10m,
        direction: current.wind_direction_10m,
        time: current.time,
        timezone: json.timezone,
        receivedAt: new Date().toISOString(),
      };
      this.target = windFromBearing(this.data.direction, this.data.speed);
      this.status = "取得成功（10分ごとに更新）";
      this.notify();
    } catch (e) {
      if (token === this.generation && requestId === this.requestId)
        this.fail("気象データを取得できません。シミュレーションを利用できます");
    } finally {
      clearTimeout(timeout);
    }
  }
  update(dt, c) {
    const a = 1 - Math.exp(-dt / 2);
    for (let i = 0; i < 3; i++)
      this.value[i] += (this.target[i] - this.value[i]) * a;
    return c.weather
      ? this.value.map((v) => (v * c.weatherGain) / 100)
      : zero();
  }
  dispose() {
    this.cancel();
    this.location = null;
    this.data = null;
  }
}
