// Frog Match - a memory matching game
// Levels follow match.cgi: 2x2 -> 4x4 -> 6x6 -> 8x8, then loop

(function () {
    "use strict";

    const LEVELS = [
        { size: 2, pairs: 2 },   // level 1: 4 cards
        { size: 4, pairs: 8 },   // level 2: 16 cards
        { size: 6, pairs: 18 },  // level 3: 36 cards
        { size: 8, pairs: 32 },  // level 4: 64 cards
    ];
    const INITIAL_UNLOCKED_LEVEL_IDX = 1; // 2x2 and 4x4 are playable up front.

    const THEMES = {
        emoji: {
            label: "Emoji",
            items: [
                "🐸", "🐢", "🦎", "🐍", "🦋", "🐝", "🌻", "🍀",
                "🐞", "🐌", "🦔", "🦊", "🐻", "🐼", "🦁", "🐯",
                "🐮", "🐷", "🐔", "🦆", "🦉", "🦜", "🐳", "🐙",
                "🦀", "🐠", "🐡", "🦈", "🌵", "🌴", "🌲", "🍄",
                "⭐", "🌙", "☀️", "❄️", "🔥", "💧",
            ],
        },
        animals: {
            label: "Animals",
            items: [
                "🦊", "🐺", "🦝", "🐗", "🦡", "🐰", "🐿️", "🦨",
                "🐭", "🐹", "🦫", "🦃", "🦅", "🦆", "🦢", "🦩",
                "🐧", "🦚", "🦉", "🦇", "🐴", "🦓", "🦒", "🦘",
                "🐃", "🐂", "🐄", "🦬", "🐪", "🦙", "🦏", "🦛",
                "🐘", "🦣", "🦍", "🦧", "🐒", "🐩",
            ],
        },
        fruit: {
            label: "Fruit",
            items: [
                "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓",
                "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝",
                "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌽", "🥕",
                "🫒", "🧄", "🧅", "🥔", "🍠", "🌶️", "🫑", "🍄",
                "🥜", "🌰", "🍞", "🥐", "🥖", "🥨",
            ],
        },
        faces: {
            label: "Faces",
            items: [
                "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
                "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
                "😘", "😗", "😋", "😛", "😜", "🤪", "😎", "🥳",
                "🤓", "🧐", "😏", "😒", "😞", "😔", "😟", "🥺",
                "😢", "😭", "😤", "😡", "🤯", "🥶",
            ],
        },
    };

    const COMPLIMENTS = [
        "Amazing!", "Very Good", "Awesome!", "You are the Greatest",
        "You Rock", "Excellent!", "You were born to Win!", "Way!",
        "How did you do that?", "You are the Coolest", "Cool",
        "You must be Gifted",
    ];

    const BUMMERS = [
        "Bummer", "So Close", "Maybe next time", "Almost",
        "Keep Trying", "Don't give Up", "You can do it",
        "Man! I thought you had that one", "No Way",
        "Close (I think)",
    ];

    // ---- State -----------------------------------------------------------

    const state = {
        levelIdx: 0,
        highestIdx: INITIAL_UNLOCKED_LEVEL_IDX, // highest level unlocked
        themeKey: "emoji",
        deck: [],            // array of { symbol, matched, faceUp }
        first: null,         // index of first revealed card
        second: null,        // index of second revealed card
        matches: 0,
        locked: false,       // input lock during mismatch flip-back
        picks: 0,            // total card selections this game
        startTime: 0,        // ms timestamp when current game started
        endTime: 0,          // ms timestamp when current game ended (0 if running)
        tickHandle: null,    // setInterval handle for ticking the display
    };

    // ---- DOM refs --------------------------------------------------------

    const $board     = document.getElementById("board");
    const $themeSel  = document.getElementById("theme");
    const $level     = document.getElementById("level");
    const $score     = document.getElementById("score");
    const $newGame   = document.getElementById("newGame");
    const $status    = document.getElementById("status");
    const $banner    = document.getElementById("winBanner");
    const $winText   = document.getElementById("winText");
    const $nextLevel = document.getElementById("nextLevel");
    const $timeNow   = document.getElementById("timeNow");
    const $timeBest  = document.getElementById("timeBest");
    const $picksNow  = document.getElementById("picksNow");
    const $picksBest = document.getElementById("picksBest");

    // ---- Helpers ---------------------------------------------------------

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function shuffle(arr) {
        // Fisher-Yates
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function setStatus(msg) {
        $status.textContent = msg || "\u00A0";
    }

    function rebuildLevelOptions() {
        // Populate <select id="level"> with one entry per level. Levels above
        // the highest unlocked are disabled (locked).
        $level.innerHTML = "";
        LEVELS.forEach((lvl, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            const locked = i > state.highestIdx;
            opt.textContent = `${i + 1} (${lvl.size}x${lvl.size})${locked ? " 🔒" : ""}`;
            opt.disabled = locked;
            $level.appendChild(opt);
        });
        $level.value = String(state.levelIdx);
    }

    function updateScore() {
        const total = LEVELS[state.levelIdx].pairs;
        $score.textContent = `${state.matches} / ${total}`;
    }

    // ---- Timer -----------------------------------------------------------

    function fmtTime(ms) {
        if (ms == null || ms < 0) return "--:--";
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    }

    function bestKey() {
        return `match.best.${state.themeKey}.${state.levelIdx}`;
    }

    function bestPicksKey() {
        return `match.bestpicks.${state.themeKey}.${state.levelIdx}`;
    }

    function getBest() {
        try {
            const v = localStorage.getItem(bestKey());
            if (v == null) return null;
            const n = parseInt(v, 10);
            return isNaN(n) ? null : n;
        } catch (_) { return null; }
    }

    function setBest(ms) {
        try { localStorage.setItem(bestKey(), String(ms)); } catch (_) {}
    }

    function getBestPicks() {
        try {
            const v = localStorage.getItem(bestPicksKey());
            if (v == null) return null;
            const n = parseInt(v, 10);
            return isNaN(n) ? null : n;
        } catch (_) { return null; }
    }

    function setBestPicks(n) {
        try { localStorage.setItem(bestPicksKey(), String(n)); } catch (_) {}
    }

    function refreshBestDisplay() {
        const best = getBest();
        $timeBest.textContent = best == null ? "--:--" : fmtTime(best);
        const bp = getBestPicks();
        $picksBest.textContent = bp == null ? "--" : String(bp);
    }

    function updatePicks() {
        $picksNow.textContent = String(state.picks);
    }

    function tickTimer() {
        const now = state.endTime || Date.now();
        $timeNow.textContent = fmtTime(now - state.startTime);
    }

    function startTimer() {
        state.startTime = Date.now();
        state.endTime = 0;
        if (state.tickHandle) clearInterval(state.tickHandle);
        tickTimer();
        state.tickHandle = setInterval(tickTimer, 250);
    }

    function stopTimer() {
        state.endTime = Date.now();
        if (state.tickHandle) {
            clearInterval(state.tickHandle);
            state.tickHandle = null;
        }
        tickTimer();
        return state.endTime - state.startTime;
    }

    // ---- Game lifecycle --------------------------------------------------

    function newGame() {
        const level = LEVELS[state.levelIdx];
        const theme = THEMES[state.themeKey] || THEMES.emoji;

        // Choose N distinct symbols from theme pool
        const pool = shuffle(theme.items.slice());
        const symbols = pool.slice(0, level.pairs);

        // Build deck: each symbol twice, then shuffle
        const deck = [];
        for (const s of symbols) {
            deck.push({ symbol: s, matched: false, faceUp: false });
            deck.push({ symbol: s, matched: false, faceUp: false });
        }
        shuffle(deck);

        state.deck    = deck;
        state.first   = null;
        state.second  = null;
        state.matches = 0;
        state.locked  = false;
        state.picks   = 0;

        $level.value = String(state.levelIdx);
        updateScore();
        updatePicks();
        setStatus("Find the pairs!");
        $banner.hidden = true;

        renderBoard();
        refreshBestDisplay();
        startTimer();
    }

    function renderBoard() {
        const level = LEVELS[state.levelIdx];
        $board.style.setProperty("--cols", level.size);
        $board.innerHTML = "";

        state.deck.forEach((card, idx) => {
            const el = document.createElement("div");
            el.className = "card";
            el.dataset.idx = idx;
            applyCardClass(el, card);
            el.addEventListener("click", () => onCardClick(idx));
            $board.appendChild(el);
        });
    }

    function applyCardClass(el, card) {
        if (card.matched) {
            el.classList.remove("face-down");
            el.classList.add("face-up", "matched");
            el.textContent = card.symbol;
        } else if (card.faceUp) {
            el.classList.remove("face-down", "matched");
            el.classList.add("face-up");
            el.textContent = card.symbol;
        } else {
            el.classList.remove("face-up", "matched");
            el.classList.add("face-down");
            el.textContent = "";
        }
    }

    function refreshCard(idx) {
        const el = $board.children[idx];
        if (el) applyCardClass(el, state.deck[idx]);
    }

    // ---- Click logic -----------------------------------------------------

    function onCardClick(idx) {
        if (state.locked) return;
        const card = state.deck[idx];
        if (card.matched || card.faceUp) return;

        card.faceUp = true;
        refreshCard(idx);
        state.picks += 1;
        updatePicks();

        if (state.first === null) {
            state.first = idx;
            return;
        }

        if (state.second === null && idx !== state.first) {
            state.second = idx;
            evaluatePair();
        }
    }

    function evaluatePair() {
        const a = state.deck[state.first];
        const b = state.deck[state.second];

        if (a.symbol === b.symbol) {
            // Match!
            a.matched = true;
            b.matched = true;
            refreshCard(state.first);
            refreshCard(state.second);
            state.matches += 1;
            updateScore();
            setStatus(pick(COMPLIMENTS));
            state.first = null;
            state.second = null;

            if (state.matches >= LEVELS[state.levelIdx].pairs) {
                setTimeout(showWin, 400);
            }
        } else {
            // Mismatch - flip back after a pause
            state.locked = true;
            setStatus(pick(BUMMERS));
            setTimeout(() => {
                a.faceUp = false;
                b.faceUp = false;
                refreshCard(state.first);
                refreshCard(state.second);
                state.first = null;
                state.second = null;
                state.locked = false;
            }, 900);
        }
    }

    // ---- Win + level progression -----------------------------------------

    function showWin() {
        const elapsed = stopTimer();
        const prevBest = getBest();
        let bestMsg = "";
        if (prevBest == null || elapsed < prevBest) {
            setBest(elapsed);
            bestMsg = " — New best time! 🏆";
        }
        const prevBestPicks = getBestPicks();
        let picksMsg = "";
        if (prevBestPicks == null || state.picks < prevBestPicks) {
            setBestPicks(state.picks);
            picksMsg = " — Fewest picks! 🎯";
        }
        refreshBestDisplay();

        const isLast = state.levelIdx === LEVELS.length - 1;
        const base = isLast
            ? "You beat all the levels! 🏆"
            : "You Win! 🎉";
        $winText.textContent =
            `${base} (${fmtTime(elapsed)}, ${state.picks} picks)${bestMsg}${picksMsg}`;
        $nextLevel.textContent = isLast ? "Play Again" : "Next Level";
        $banner.hidden = false;
    }

    function advanceLevel() {
        // Auto-advance after a win unlocks the next level (looping).
        state.levelIdx = (state.levelIdx + 1) % LEVELS.length;
        if (state.levelIdx > state.highestIdx) {
            state.highestIdx = state.levelIdx;
        }
        rebuildLevelOptions();
        saveSettings();
        newGame();
    }

    // ---- Persistence -----------------------------------------------------

    function saveSettings() {
        try {
            localStorage.setItem("match.theme", state.themeKey);
            localStorage.setItem("match.level", String(state.levelIdx));
            localStorage.setItem("match.highest", String(state.highestIdx));
        } catch (_) { /* ignore */ }
    }

    function loadSettings() {
        try {
            const t = localStorage.getItem("match.theme");
            const l = localStorage.getItem("match.level");
            const h = localStorage.getItem("match.highest");
            if (t && THEMES[t]) state.themeKey = t;
            if (h !== null) {
                const n = parseInt(h, 10);
                if (!isNaN(n) && n >= 0 && n < LEVELS.length) {
                    state.highestIdx = Math.max(n, INITIAL_UNLOCKED_LEVEL_IDX);
                }
            }
            if (l !== null) {
                const n = parseInt(l, 10);
                if (!isNaN(n) && n >= 0 && n < LEVELS.length) {
                    state.levelIdx = Math.min(n, state.highestIdx);
                }
            }
        } catch (_) { /* ignore */ }
    }

    // ---- Wire up ---------------------------------------------------------

    function init() {
        loadSettings();
        $themeSel.value = state.themeKey;
        rebuildLevelOptions();

        $themeSel.addEventListener("change", () => {
            state.themeKey = $themeSel.value;
            saveSettings();
            refreshBestDisplay();
            newGame();
        });

        $level.addEventListener("change", () => {
            const requested = parseInt($level.value, 10);
            if (isNaN(requested)) return;
            // Only allow moving DOWN (or staying); levels above highest are
            // disabled but guard anyway.
            if (requested > state.highestIdx) {
                $level.value = String(state.levelIdx);
                return;
            }
            state.levelIdx = requested;
            saveSettings();
            newGame();
        });

        $newGame.addEventListener("click", () => {
            // New game keeps current level
            newGame();
        });

        $nextLevel.addEventListener("click", () => {
            advanceLevel();
        });

        newGame();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
