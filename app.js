// 網路概論可愛複習樂園 - 互動邏輯與刷題系統
(function () {
  const STORAGE_KEY = "nt2_cute_review_v1";

  const defaultState = {
    mastered: [],   // 答對過的題目 ID
    wrongBook: [],  // 錯題本 ID
    bookmarks: [],  // 收藏重點 ID
    bestCombo: 0,
    totalAnswered: 0
  };

  let userState = loadState();

  // Study Filter State
  let studyFilter = "all";
  let searchQuery = "";
  let maskMode = false;
  let revealedInMask = new Set();

  // Active Quiz State
  let quizPool = [];
  let quizIndex = 0;
  let quizAnswers = []; // { qId, chosenOriginalIdx, isCorrect, displayedOptions }
  let currentCombo = 0;
  let quizStartTime = 0;
  let quizModeTitle = "";
  let instantFeedback = true;
  let shuffleQuestions = true;
  let shuffleOptions = false;
  let soundEnabled = true;

  // Audio Context (lazy init)
  let audioCtx = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return {
        mastered: Array.isArray(parsed.mastered) ? parsed.mastered : [],
        wrongBook: Array.isArray(parsed.wrongBook) ? parsed.wrongBook : [],
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        bestCombo: Number(parsed.bestCombo) || 0,
        totalAnswered: Number(parsed.totalAnswered) || 0
      };
    } catch (e) {
      return { ...defaultState };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userState));
    } catch (e) {
      // ignore storage quota errors
    }
    updateDashboardStats();
    renderFilterPills();
    updateQuizLauncherCounts();
  }

  function playTone(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;

      if (type === "correct") {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.08, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.22);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + i * 0.07);
          osc.stop(now + i * 0.07 + 0.24);
        });
      } else if (type === "wrong") {
        [310, 250].forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.08, now + i * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.22);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now + i * 0.1);
          osc.stop(now + i * 0.1 + 0.24);
        });
      }
    } catch (e) {
      // ignore audio errors
    }
  }

  // Confetti Effect
  function launchConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#FF8FAB", "#FFD166", "#72EFDD", "#B388EB", "#56CFE1", "#FF6B6B"];
    const pieces = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      w: 8 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2.5 + Math.random() * 3.5,
      vx: -1.8 + Math.random() * 3.6,
      rot: Math.random() * Math.PI * 2,
      vrot: -0.1 + Math.random() * 0.2
    }));

    let frame = 0;
    function step() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 170) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(step);
  }

  function getCatMeta(catId) {
    return CATEGORIES.find((c) => c.id === catId) || CATEGORIES[0];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ==================== DASHBOARD & TABS ====================
  function updateDashboardStats() {
    document.getElementById("stat-mastered").textContent = `${userState.mastered.length} / ${QUESTIONS.length}`;
    document.getElementById("stat-bookmarks").textContent = `${userState.bookmarks.length} 題`;
    document.getElementById("stat-wrong").textContent = `${userState.wrongBook.length} 題`;
    document.getElementById("stat-combo").textContent = `x${userState.bestCombo}`;

    const mascotMsg = document.getElementById("mascot-quote");
    if (userState.mastered.length === QUESTIONS.length) {
      mascotMsg.textContent = "太強啦！35 題全數制霸，段考準備拿 100 分喵！🎉";
    } else if (userState.wrongBook.length > 0) {
      mascotMsg.textContent = `錯題本裡有 ${userState.wrongBook.length} 題小怪獸，去刷題消滅它們吧！💪`;
    } else if (userState.mastered.length >= 15) {
      mascotMsg.textContent = `已經掌握 ${userState.mastered.length} 題囉，手感超棒繼續衝！✨`;
    } else {
      mascotMsg.textContent = "嗨三年仁班同學！先看口訣詳解，再來刷題拿滿分喵～🐾";
    }
  }

  function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${tabId}`);
    });
    if (tabId === "study") {
      renderStudyList();
    } else if (tabId === "quiz") {
      updateQuizLauncherCounts();
    }
  }

  // ==================== STUDY MODE ====================
  function renderFilterPills() {
    const wrap = document.getElementById("filter-pills");
    const items = [
      { id: "all", label: "🌈 全部精選", count: QUESTIONS.length },
      ...CATEGORIES.map((c) => ({
        id: c.id,
        label: `${c.icon} ${c.name}`,
        count: QUESTIONS.filter((q) => q.category === c.id).length
      })),
      { id: "bookmarks", label: "⭐ 重點收藏", count: userState.bookmarks.length },
      { id: "wrong", label: "🩹 錯題本", count: userState.wrongBook.length }
    ];

    wrap.innerHTML = items
      .map(
        (it) => `
      <button type="button" class="pill-btn ${studyFilter === it.id ? "active" : ""}" data-filter="${it.id}">
        <span>${it.label}</span>
        <span class="pill-count">${it.count}</span>
      </button>
    `
      )
      .join("");

    wrap.querySelectorAll(".pill-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        studyFilter = btn.dataset.filter;
        renderFilterPills();
        renderStudyList();
      });
    });
  }

  function getFilteredStudyQuestions() {
    return QUESTIONS.filter((q) => {
      if (studyFilter === "bookmarks" && !userState.bookmarks.includes(q.id)) return false;
      if (studyFilter === "wrong" && !userState.wrongBook.includes(q.id)) return false;
      if (
        studyFilter !== "all" &&
        studyFilter !== "bookmarks" &&
        studyFilter !== "wrong" &&
        q.category !== studyFilter
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        const hay = [
          q.question,
          ...q.options,
          q.tip,
          q.explanation.summary,
          ...q.explanation.details,
          `第${q.examNo}題`,
          `q${q.examNo}`
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function toggleBookmark(qId) {
    const idx = userState.bookmarks.indexOf(qId);
    if (idx >= 0) {
      userState.bookmarks.splice(idx, 1);
    } else {
      userState.bookmarks.push(qId);
    }
    saveState();
    renderStudyList();
    syncQuizStarButton();
  }

  function renderStudyList() {
    const listEl = document.getElementById("study-list");
    const countEl = document.getElementById("study-result-count");
    const filtered = getFilteredStudyQuestions();

    countEl.textContent = `目前顯示 ${filtered.length} / ${QUESTIONS.length} 題`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">🐣</div>
          <h3>找不到符合條件的題目耶～</h3>
          <p>試試切換上方的分類標籤，或清除搜尋關鍵字看看吧！</p>
        </div>
      `;
      return;
    }

    const letters = ["A", "B", "C", "D"];
    listEl.innerHTML = filtered
      .map((q) => {
        const cat = getCatMeta(q.category);
        const isStarred = userState.bookmarks.includes(q.id);
        const isWrong = userState.wrongBook.includes(q.id);
        const isMastered = userState.mastered.includes(q.id);
        const isMasked = maskMode && !revealedInMask.has(q.id);

        return `
        <article class="q-card ${isMasked ? "masked" : ""}" data-qid="${q.id}">
          <div class="q-card-header">
            <div class="q-badges">
              <span class="q-index-badge">精選 #${String(q.id).padStart(2, "0")}</span>
              <span class="q-exam-badge">原卷第 ${q.examNo} 題</span>
              <span class="q-cat-badge" style="background:${cat.bg};">${cat.icon} ${cat.name}</span>
              ${isWrong ? '<span class="q-status-tag wrong">🩹 待複習錯題</span>' : isMastered ? '<span class="q-status-tag mastered">✅ 已刷對</span>' : ""}
            </div>
            <button type="button" class="star-btn ${isStarred ? "starred" : ""}" data-star="${q.id}">
              <span>${isStarred ? "⭐ 已收藏" : "☆ 收藏重點"}</span>
            </button>
          </div>

          <div class="q-stem">${escapeHtml(q.question)}</div>

          <div class="q-options-grid">
            ${q.options
              .map(
                (opt, i) => `
              <div class="q-opt-item ${i === q.answer ? "is-answer" : ""}">
                <span class="q-opt-letter">${letters[i]}</span>
                <span>${escapeHtml(opt)}</span>
              </div>
            `
              )
              .join("")}
          </div>

          <button type="button" class="mask-curtain" data-reveal="${q.id}">
            ✨ 點擊翻開正確答案與秒懂詳解
          </button>

          <div class="exp-box">
            <div class="tip-banner">
              <span>💡</span>
              <div><strong>秒懂口訣｜正解 (${letters[q.answer]})：</strong>${escapeHtml(q.tip)}</div>
            </div>
            <p class="exp-summary">${escapeHtml(q.explanation.summary)}</p>
            <ul class="exp-details">
              ${q.explanation.details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
            </ul>
          </div>
        </article>
      `;
      })
      .join("");

    listEl.querySelectorAll("[data-star]").forEach((btn) => {
      btn.addEventListener("click", () => toggleBookmark(Number(btn.dataset.star)));
    });

    listEl.querySelectorAll("[data-reveal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.reveal);
        revealedInMask.add(id);
        const card = btn.closest(".q-card");
        if (card) card.classList.remove("masked");
      });
    });
  }

  // ==================== QUIZ MODE ====================
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function updateQuizLauncherCounts() {
    const wrongBtn = document.getElementById("start-wrong-quiz");
    const wrongBadge = document.getElementById("wrong-quiz-badge");
    wrongBadge.textContent = `${userState.wrongBook.length} 題`;
    wrongBtn.disabled = userState.wrongBook.length === 0;

    const starBtn = document.getElementById("start-star-quiz");
    const starBadge = document.getElementById("star-quiz-badge");
    starBadge.textContent = `${userState.bookmarks.length} 題`;
    starBtn.disabled = userState.bookmarks.length === 0;

    const catWrap = document.getElementById("cat-drill-btns");
    catWrap.innerHTML = CATEGORIES.map((c) => {
      const count = QUESTIONS.filter((q) => q.category === c.id).length;
      return `
        <button type="button" class="pill-btn" data-catquiz="${c.id}" style="background:${c.bg}">
          <span>${c.icon} ${c.name}</span>
          <span class="pill-count">${count} 題</span>
        </button>
      `;
    }).join("");

    catWrap.querySelectorAll("[data-catquiz]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = getCatMeta(btn.dataset.catquiz);
        const pool = QUESTIONS.filter((q) => q.category === c.id);
        startQuiz(pool, `${c.icon} ${c.name}專項特訓`);
      });
    });
  }

  function startQuiz(questionsSubset, title) {
    if (!questionsSubset || questionsSubset.length === 0) return;

    shuffleQuestions = document.getElementById("chk-shuffle-q").checked;
    shuffleOptions = document.getElementById("chk-shuffle-opt").checked;
    instantFeedback = document.getElementById("chk-instant").checked;
    soundEnabled = document.getElementById("chk-sound").checked;

    const ordered = shuffleQuestions ? shuffleArray(questionsSubset) : [...questionsSubset];
    quizPool = ordered.map((q) => {
      const indices = shuffleOptions ? shuffleArray([0, 1, 2, 3]) : [0, 1, 2, 3];
      return {
        questionObj: q,
        optionMap: indices // displayed index -> original option index
      };
    });

    quizIndex = 0;
    quizAnswers = new Array(quizPool.length).fill(null);
    currentCombo = 0;
    quizStartTime = Date.now();
    quizModeTitle = title;

    document.getElementById("quiz-launcher").style.display = "none";
    document.getElementById("quiz-result").classList.remove("active");
    document.getElementById("quiz-arena").classList.add("active");

    renderCurrentQuizQuestion();
  }

  function syncQuizStarButton() {
    const btn = document.getElementById("quiz-star-btn");
    if (!btn || !quizPool[quizIndex]) return;
    const qId = quizPool[quizIndex].questionObj.id;
    const starred = userState.bookmarks.includes(qId);
    btn.classList.toggle("starred", starred);
    btn.textContent = starred ? "⭐ 已收藏" : "☆ 收藏此題";
  }

  function renderCurrentQuizQuestion() {
    const item = quizPool[quizIndex];
    const q = item.questionObj;
    const cat = getCatMeta(q.category);
    const letters = ["A", "B", "C", "D"];

    document.getElementById("quiz-mode-title").textContent = quizModeTitle;
    document.getElementById("quiz-progress-text").textContent = `第 ${quizIndex + 1} / ${quizPool.length} 題`;
    const pct = Math.round(((quizIndex + 1) / quizPool.length) * 100);
    document.getElementById("quiz-progress-fill").style.width = `${pct}%`;

    const comboEl = document.getElementById("quiz-combo-pill");
    comboEl.textContent = `🔥 連對 Combo x${currentCombo}`;

    document.getElementById("quiz-q-meta").innerHTML = `
      <span class="q-index-badge">精選 #${String(q.id).padStart(2, "0")}</span>
      <span class="q-exam-badge">原卷第 ${q.examNo} 題</span>
      <span class="q-cat-badge" style="background:${cat.bg};">${cat.icon} ${cat.name}</span>
    `;
    syncQuizStarButton();

    document.getElementById("quiz-q-stem").textContent = q.question;

    const existingAns = quizAnswers[quizIndex];
    const optsEl = document.getElementById("quiz-options-list");
    optsEl.innerHTML = item.optionMap
      .map((origIdx, dispIdx) => {
        let cls = "quiz-opt-btn";
        let disabledAttr = "";
        if (existingAns) {
          if (instantFeedback) {
            disabledAttr = "disabled";
            if (origIdx === q.answer) cls += " correct";
            else if (origIdx === existingAns.chosenOrigIdx) cls += " wrong";
          } else if (origIdx === existingAns.chosenOrigIdx) {
            cls += " selected-mock";
          }
        }
        return `
        <button type="button" class="${cls}" data-disp="${dispIdx}" ${disabledAttr}>
          <span class="quiz-opt-key">${letters[dispIdx]}</span>
          <span>${escapeHtml(q.options[origIdx])}</span>
        </button>
      `;
      })
      .join("");

    optsEl.querySelectorAll(".quiz-opt-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleSelectOption(Number(btn.dataset.disp)));
    });

    const fbArea = document.getElementById("quiz-feedback-area");
    if (existingAns && instantFeedback) {
      showQuizFeedback(q, item.optionMap, existingAns.isCorrect);
    } else {
      fbArea.classList.remove("show");
      fbArea.innerHTML = "";
    }

    const prevBtn = document.getElementById("quiz-prev-btn");
    prevBtn.style.visibility = quizIndex > 0 ? "visible" : "hidden";

    const nextBtn = document.getElementById("quiz-next-btn");
    const isLast = quizIndex === quizPool.length - 1;
    if (instantFeedback) {
      nextBtn.style.display = existingAns ? "inline-flex" : "none";
      nextBtn.innerHTML = isLast ? "🏆 查看成績單" : "下一題 ➔";
    } else {
      nextBtn.style.display = "inline-flex";
      nextBtn.innerHTML = isLast ? "📝 交卷看成績單" : "下一題 ➔";
    }
  }

  function showQuizFeedback(q, optionMap, isCorrect) {
    const letters = ["A", "B", "C", "D"];
    const correctDispIdx = optionMap.indexOf(q.answer);
    const fbArea = document.getElementById("quiz-feedback-area");
    fbArea.innerHTML = `
      <div class="feedback-banner ${isCorrect ? "ok" : "ng"}">
        <span>${isCorrect ? "🎉 答對啦！太棒了喵～" : `😿 差一點點！正確答案是 (${letters[correctDispIdx]}) ${escapeHtml(q.options[q.answer])}`}</span>
      </div>
      <div class="exp-box">
        <div class="tip-banner">
          <span>💡</span>
          <div><strong>秒懂口訣：</strong>${escapeHtml(q.tip)}</div>
        </div>
        <p class="exp-summary">${escapeHtml(q.explanation.summary)}</p>
        <ul class="exp-details">
          ${q.explanation.details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
        </ul>
      </div>
    `;
    fbArea.classList.add("show");
  }

  function recordQuestionOutcome(qId, isCorrect) {
    userState.totalAnswered += 1;
    if (isCorrect) {
      if (!userState.mastered.includes(qId)) userState.mastered.push(qId);
      const wIdx = userState.wrongBook.indexOf(qId);
      if (wIdx >= 0) userState.wrongBook.splice(wIdx, 1);
    } else {
      if (!userState.wrongBook.includes(qId)) userState.wrongBook.push(qId);
    }
  }

  function handleSelectOption(dispIdx) {
    const item = quizPool[quizIndex];
    const q = item.questionObj;
    const chosenOrigIdx = item.optionMap[dispIdx];
    const isCorrect = chosenOrigIdx === q.answer;

    if (instantFeedback && quizAnswers[quizIndex]) return;

    quizAnswers[quizIndex] = {
      qId: q.id,
      chosenOrigIdx,
      isCorrect
    };

    if (instantFeedback) {
      if (isCorrect) {
        currentCombo += 1;
        if (currentCombo > userState.bestCombo) {
          userState.bestCombo = currentCombo;
        }
        playTone("correct");
        const comboEl = document.getElementById("quiz-combo-pill");
        comboEl.classList.add("pop");
        setTimeout(() => comboEl.classList.remove("pop"), 220);
      } else {
        currentCombo = 0;
        playTone("wrong");
      }
      recordQuestionOutcome(q.id, isCorrect);
      saveState();
      renderCurrentQuizQuestion();
    } else {
      renderCurrentQuizQuestion();
    }
  }

  function goNextQuestion() {
    if (!instantFeedback && quizIndex === quizPool.length - 1) {
      const unanswered = quizAnswers.filter((a) => !a).length;
      if (unanswered > 0) {
        const ok = window.confirm(`還有 ${unanswered} 題尚未作答，確定要直接交卷嗎？`);
        if (!ok) return;
      }
      finishQuiz();
      return;
    }

    if (quizIndex < quizPool.length - 1) {
      quizIndex += 1;
      renderCurrentQuizQuestion();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    if (!instantFeedback) {
      let streak = 0;
      quizPool.forEach((item, idx) => {
        const ans = quizAnswers[idx];
        const ok = Boolean(ans && ans.isCorrect);
        if (ok) {
          streak += 1;
          if (streak > userState.bestCombo) userState.bestCombo = streak;
        } else {
          streak = 0;
        }
        recordQuestionOutcome(item.questionObj.id, ok);
      });
      saveState();
    }

    const total = quizPool.length;
    const correctCount = quizAnswers.filter((a) => a && a.isCorrect).length;
    const wrongCount = total - correctCount;
    const score = Math.round((correctCount / total) * 100);
    const elapsedSec = Math.max(1, Math.round((Date.now() - quizStartTime) / 1000));
    const minStr = Math.floor(elapsedSec / 60);
    const secStr = elapsedSec % 60;

    document.getElementById("quiz-arena").classList.remove("active");
    const resEl = document.getElementById("quiz-result");
    resEl.classList.add("active");

    document.getElementById("res-score-ring").style.setProperty("--pct", `${score}%`);
    document.getElementById("res-score-num").textContent = score;
    document.getElementById("res-correct").textContent = `✅ 答對 ${correctCount} 題`;
    document.getElementById("res-wrong").textContent = `❌ 答錯 ${wrongCount} 題`;
    document.getElementById("res-time").textContent = `⏱️ 用時 ${minStr > 0 ? `${minStr}分` : ""}${secStr}秒`;

    const rankEl = document.getElementById("res-rank-title");
    const subEl = document.getElementById("res-rank-sub");
    if (score === 100) {
      rankEl.textContent = "👑 傳說級網概滿分貓貓王！";
      subEl.textContent = "完美全對！第二次段考穩拿 100 分，太神啦！";
      launchConfetti();
    } else if (score >= 85) {
      rankEl.textContent = "🌟 段考高分學霸預備軍！";
      subEl.textContent = "觀念非常紮實！把下面幾題小失誤看懂就無敵囉！";
      launchConfetti();
    } else if (score >= 60) {
      rankEl.textContent = "🐾 穩步升級中的網路小達人！";
      subEl.textContent = "已經及格過關！搭配下方口訣再刷一次錯題會進步超快！";
    } else {
      rankEl.textContent = "🌱 潛力無限暖身中！";
      subEl.textContent = "別氣餒～錯題都幫你整理好詳解了，看過一遍馬上變強！";
    }

    const retryWrongBtn = document.getElementById("res-retry-wrong");
    const wrongItems = quizPool
      .filter((_, idx) => !quizAnswers[idx] || !quizAnswers[idx].isCorrect)
      .map((it) => it.questionObj);
    retryWrongBtn.style.display = wrongItems.length > 0 ? "inline-flex" : "none";
    retryWrongBtn.onclick = () => startQuiz(wrongItems, "🩹 本回錯題立即重刷");

    renderResultReviewList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderResultReviewList() {
    const letters = ["A", "B", "C", "D"];
    const wrap = document.getElementById("res-review-list");
    wrap.innerHTML = quizPool
      .map((item, idx) => {
        const q = item.questionObj;
        const ans = quizAnswers[idx];
        const ok = Boolean(ans && ans.isCorrect);
        const chosenText =
          ans && typeof ans.chosenOrigIdx === "number"
            ? `(${letters[ans.chosenOrigIdx]}) ${escapeHtml(q.options[ans.chosenOrigIdx])}`
            : "未作答";

        return `
        <div class="q-card" style="margin-top:14px; border-color:${ok ? "#40916C" : "#E03131"}">
          <div class="q-card-header">
            <div class="q-badges">
              <span class="q-index-badge">第 ${idx + 1} 題（原卷 Q${q.examNo}）</span>
              <span class="q-status-tag ${ok ? "mastered" : "wrong"}">${ok ? "✅ 答對" : "❌ 答錯"}</span>
            </div>
          </div>
          <div class="q-stem">${escapeHtml(q.question)}</div>
          <p style="font-size:0.9rem; font-weight:700; margin-bottom:10px; color:${ok ? "#2D6A4F" : "#C92A2A"}">
            你的作答：${chosenText} ｜ 正確答案：(${letters[q.answer]}) ${escapeHtml(q.options[q.answer])}
          </p>
          <div class="exp-box">
            <div class="tip-banner">
              <span>💡</span>
              <div><strong>秒懂口訣：</strong>${escapeHtml(q.tip)}</div>
            </div>
            <p class="exp-summary">${escapeHtml(q.explanation.summary)}</p>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function exitQuizToLauncher() {
    document.getElementById("quiz-arena").classList.remove("active");
    document.getElementById("quiz-result").classList.remove("active");
    document.getElementById("quiz-launcher").style.display = "block";
    updateQuizLauncherCounts();
  }

  // ==================== SWITCH CALCULATOR (Q37) ====================
  function updateSwitchCalculator() {
    const pcInput = document.getElementById("calc-pcs");
    const portInput = document.getElementById("calc-ports");
    const outEl = document.getElementById("calc-output");
    if (!pcInput || !portInput || !outEl) return;

    const pcs = Math.max(1, parseInt(pcInput.value, 10) || 45);
    const ports = Math.max(3, parseInt(portInput.value, 10) || 12);

    let needed = 1;
    if (pcs > ports) {
      // Formula: ports * N - 2 * (N - 1) >= pcs  =>  (ports - 2) * N + 2 >= pcs
      needed = Math.ceil((pcs - 2) / (ports - 2));
    }
    const maxSupported = needed === 1 ? ports : (ports - 2) * needed + 2;
    const prevSupported = needed > 1 ? (ports - 2) * (needed - 1) + 2 : 0;

    outEl.innerHTML = `
      <div>📌 公式：<code>${ports}N - 2(N - 1) = ${ports - 2}N + 2</code> 台電腦</div>
      <div style="margin-top:4px;">
        至少需要 <span class="calc-highlight">${needed} 台</span> ${ports} 埠交換器！
        （最多可接 <strong>${maxSupported}</strong> 台電腦${needed > 1 ? `；若只用 ${needed - 1} 台僅能接 ${prevSupported} 台` : ""}）
      </div>
    `;
  }

  // ==================== INIT & EVENTS ====================
  function init() {
    updateDashboardStats();
    renderFilterPills();
    renderStudyList();
    updateQuizLauncherCounts();
    updateSwitchCalculator();

    // Main Tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Search Input
    const searchInput = document.getElementById("study-search");
    const clearBtn = document.getElementById("clear-search");
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      clearBtn.style.display = searchQuery ? "block" : "none";
      renderStudyList();
    });
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      clearBtn.style.display = "none";
      renderStudyList();
    });

    // Mask Mode Toggle
    const maskBtn = document.getElementById("toggle-mask-btn");
    maskBtn.addEventListener("click", () => {
      maskMode = !maskMode;
      revealedInMask.clear();
      maskBtn.classList.toggle("active", maskMode);
      maskBtn.innerHTML = maskMode ? "🙈 背誦遮罩：開啟中（點擊卡片看答案）" : "👀 背誦遮罩：關閉（直接顯示詳解）";
      renderStudyList();
    });

    // Quick Jump to Quiz from Study
    document.getElementById("jump-to-quiz-btn").addEventListener("click", () => {
      switchTab("quiz");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Quiz Mode Buttons
    document.getElementById("start-all-quiz").addEventListener("click", () => {
      startQuiz(QUESTIONS, "🌟 精選 35 題段考全刷挑戰");
    });

    document.getElementById("start-quick10-quiz").addEventListener("click", () => {
      const sample = shuffleArray(QUESTIONS).slice(0, 10);
      startQuiz(sample, "⚡ 閃電 10 題隨機快刷");
    });

    document.getElementById("start-wrong-quiz").addEventListener("click", () => {
      const pool = QUESTIONS.filter((q) => userState.wrongBook.includes(q.id));
      startQuiz(pool, "🩹 錯題消滅戰");
    });

    document.getElementById("start-star-quiz").addEventListener("click", () => {
      const pool = QUESTIONS.filter((q) => userState.bookmarks.includes(q.id));
      startQuiz(pool, "⭐ 收藏重點特訓");
    });

    document.getElementById("reset-records-btn").addEventListener("click", () => {
      if (window.confirm("確定要清空目前的刷題進度、錯題本與收藏紀錄嗎？")) {
        userState = { ...defaultState, mastered: [], wrongBook: [], bookmarks: [] };
        saveState();
        renderStudyList();
      }
    });

    // Quiz Arena Controls
    document.getElementById("quiz-quit-btn").addEventListener("click", exitQuizToLauncher);
    document.getElementById("quiz-star-btn").addEventListener("click", () => {
      if (quizPool[quizIndex]) toggleBookmark(quizPool[quizIndex].questionObj.id);
    });
    document.getElementById("quiz-prev-btn").addEventListener("click", () => {
      if (quizIndex > 0) {
        quizIndex -= 1;
        renderCurrentQuizQuestion();
      }
    });
    document.getElementById("quiz-next-btn").addEventListener("click", goNextQuestion);
    document.getElementById("res-back-launcher").addEventListener("click", exitQuizToLauncher);
    document.getElementById("res-play-again").addEventListener("click", () => {
      const samePool = quizPool.map((it) => it.questionObj);
      startQuiz(samePool, quizModeTitle);
    });

    // Keyboard Shortcuts in Quiz Arena
    document.addEventListener("keydown", (e) => {
      const arena = document.getElementById("quiz-arena");
      if (!arena.classList.contains("active")) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      const keyMap = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
      const lower = e.key.toLowerCase();
      if (lower in keyMap) {
        e.preventDefault();
        handleSelectOption(keyMap[lower]);
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        const nextBtn = document.getElementById("quiz-next-btn");
        if (nextBtn.style.display !== "none") {
          e.preventDefault();
          goNextQuestion();
        }
      }
    });

    // Calculator Inputs
    document.getElementById("calc-pcs").addEventListener("input", updateSwitchCalculator);
    document.getElementById("calc-ports").addEventListener("input", updateSwitchCalculator);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
