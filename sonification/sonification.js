// sonification/sonification.js
// Temperature audio engine — no frontend changes required yet.

window.temperaturePlayer = (() => {
  "use strict";

  // Resolve the CSV relative to THIS JavaScript file.
  const scriptURL = document.currentScript.src;
  const csvURL = new URL(
    "../data/processed/GLB_Temperature_Anomaly_1995_2024.csv",
    scriptURL
  );

  let data = [];
  let audioContext;
  let masterGain;
  let voices = [];

  let playing = false;
  let loading;
  let starting = false;
  let position = 0;
  let startedAt = 0;
  let speed = 1;
  let volume = 0.25;
  let animationFrame;
  let lastIndex = -1;

  // The frontend can listen for these events later.
  function emit(name, detail) {
    window.dispatchEvent(
      new CustomEvent(`temperature:${name}`, { detail })
    );
  }

  async function load() {
    if (data.length) return data.map(point => ({ ...point }));
    if (loading) return loading;

    loading = (async () => {
      const response = await fetch(csvURL);

      if (!response.ok) {
        throw new Error(`Cannot load CSV: HTTP ${response.status}`);
      }

      const text = await response.text();

      const points = text
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .map(row => row.split(",").map(cell => cell.trim()))
        .filter(row => /^\d{4}$/.test(row[0]))
        .filter(row => Number(row[0]) >= 1995 && Number(row[0]) <= 2024)
        .map(row => ({
          year: Number(row[0]),
          // Raw NASA header: Year, Jan...Dec, J-D...
          anomaly: row[13] ? Number(row[13]) : NaN
        }))
        .sort((a, b) => a.year - b.year);

      if (
        points.length !== 30 ||
        points.some(
          (point, index) =>
            point.year !== 1995 + index ||
            !Number.isFinite(point.anomaly)
        )
      ) {
        throw new Error(
          "Expected a valid annual J-D value for every year, 1995–2024."
        );
      }

      const minimum = Math.min(...points.map(point => point.anomaly));
      const maximum = Math.max(...points.map(point => point.anomaly));
      const range = maximum - minimum;

      data = points.map(point => ({
        ...point,
        // Map the observed range across two octaves: 220–880 Hz.
        frequency:
          range === 0
            ? 440
            : 220 * Math.pow(4, (point.anomaly - minimum) / range)
      }));

      const result = data.map(point => ({ ...point }));
      emit("ready", result);
      return result;
    })();

    try {
      return await loading;
    } catch (error) {
      emit("error", { message: error.message });
      throw error;
    } finally {
      loading = null;
    }
  }

  function setupAudio() {
    if (audioContext) return;

    const Audio = window.AudioContext || window.webkitAudioContext;

    if (!Audio) {
      throw new Error("Your browser does not support Web Audio.");
    }

    audioContext = new Audio();
    masterGain = audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioContext.destination);
  }

  // Position is measured in years, including fractions of a year.
  function currentPosition() {
    const elapsed = playing
      ? (audioContext.currentTime - startedAt) * speed
      : 0;

    return Math.min(data.length, position + elapsed);
  }

  function clearAudio() {
    cancelAnimationFrame(animationFrame);

    for (const voice of voices) {
      voice.oscillator.onended = null;
      try {
        voice.oscillator.stop();
      } catch {
        // The oscillator may already have ended.
      }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }

    voices = [];
  }

  function publishPosition(force = false) {
    if (!data.length) return;

    const progress = currentPosition();
    const index = Math.min(data.length - 1, Math.floor(progress));

    if (force || index !== lastIndex) {
      lastIndex = index;

      emit("update", {
        ...data[index],
        index,
        total: data.length,
        progress: progress / data.length
      });
    }
  }

  function animate() {
    publishPosition();

    if (currentPosition() >= data.length) {
      position = data.length;
      playing = false;
      clearAudio();

      emit("state", { state: "ended" });
      return;
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function scheduleAudio() {
    const now = audioContext.currentTime;
    startedAt = now;

    for (let index = Math.floor(position); index < data.length; index++) {
      const start = now + Math.max(0, index - position) / speed;

      // Resume only the remaining portion of a paused year.
      const duration =
        (index + 1 - Math.max(index, position)) / speed;

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        data[index].frequency,
        start
      );

      // Gentle fades prevent abrupt clicks between tones.
      const attack = Math.min(0.03, duration / 4);
      const release = Math.min(0.06, duration / 3);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.45, start + attack);
      gain.gain.setValueAtTime(0.45, start + duration - release);
      gain.gain.linearRampToValueAtTime(0, start + duration);

      oscillator.connect(gain);
      gain.connect(masterGain);

      const voice = { oscillator, gain };
      voices.push(voice);

      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        voices = voices.filter(item => item !== voice);
      };

      oscillator.start(start);
      oscillator.stop(start + duration);
    }
  }

  // Call play() from a button click so the browser permits audio.
  async function play() {
    if (playing || starting) return;

    starting = true;

    try {
      setupAudio();

      // Request audio activation before waiting for the CSV.
      await audioContext.resume();
      await load();

      if (position >= data.length) position = 0;

      playing = true;
      lastIndex = -1;
      scheduleAudio();

      emit("state", { state: "playing" });
      animate();
    } catch (error) {
      playing = false;
      clearAudio();
      emit("state", { state: "error", message: error.message });
      throw error;
    } finally {
      starting = false;
    }
  }

  function pause() {
    if (!playing) return;

    position = currentPosition();
    playing = false;
    clearAudio();
    publishPosition(true);

    emit("state", { state: "paused" });
  }

  function stop() {
    playing = false;
    clearAudio();
    position = 0;
    lastIndex = -1;
    publishPosition(true);

    emit("state", { state: "stopped" });
  }

  function setSpeed(value) {
    value = Number(value);

    if (!Number.isFinite(value) || value < 0.5 || value > 2) {
      throw new Error("Speed must be between 0.5 and 2.");
    }

    if (playing) {
      position = currentPosition();
      clearAudio();
      speed = value;
      scheduleAudio();
      animate();
    } else {
      speed = value;
    }
  }

  function setVolume(value) {
    value = Number(value);

    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("Volume must be between 0 and 1.");
    }

    volume = value;

    if (masterGain) {
      masterGain.gain.setTargetAtTime(
        volume,
        audioContext.currentTime,
        0.02
      );
    }
  }

  // Prevent playback from continuing unseen in a background tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  window.addEventListener("pagehide", stop);

  return {
    load,
    play,
    pause,
    stop,
    setSpeed,
    setVolume,
    getData: () => data.map(point => ({ ...point }))
  };
})();