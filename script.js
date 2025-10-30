(() => {
  "use strict";

  const STORAGE_KEY = "wish-oracle-state";
  const IMAGE_COUNT = 4;
  const INTERPRETATION_LIMIT = 200;
  const POSITIVE_WORDS = [
    "persistence",
    "patience",
    "plan",
    "action",
    "learn",
    "health",
    "friend",
    "communicate",
    "train",
    "practice",
    "reflect",
    "sleep",
    "run",
    "read",
    "record"
  ];
  const NEGATIVE_WORDS = [
    "worry",
    "anxious",
    "delay",
    "hesitate",
    "give up",
    "hard",
    "fail",
    "impossible"
  ];
  const FALLBACK_KEYWORDS = ["abstract", "texture", "light", "pattern", "nature", "sky", "water"];
  const STOP_WORDS = new Set([
    "the",
    "and",
    "with",
    "from",
    "that",
    "this",
    "have",
    "your",
    "about",
    "into",
    "make",
    "gets",
    "getting",
    "want",
    "wish",
    "need",
    "more",
    "less",
    "like",
    "just",
    "also",
    "take",
    "give",
    "new",
    "good",
    "better",
    "friend",
    "friends",
    "job"
  ]);
  const TIME_REGEX = /\b(every\s+(day|week|month)|\d+\s?(minutes?|minute|hours?|hour|times?|days?|weeks?|months?))\b/gi;
  const THEME_SEQUENCE = ["auto", "light", "dark"];
  const PLACEHOLDER_URL = "https://picsum.photos/800/450?random=";

  const elements = {
    body: document.body,
    wishSection: document.getElementById("wish-section"),
    wishInput: document.getElementById("wish-input"),
    wishError: document.getElementById("wish-error"),
    wishForm: document.getElementById("wish-form"),
    generateButton: document.getElementById("generate-btn"),
    imagesSection: document.getElementById("images-section"),
    imageGrid: document.getElementById("image-grid"),
    submitInterpretations: document.getElementById("submit-interpretations"),
    resultSection: document.getElementById("result-section"),
    probabilityValue: document.getElementById("probability-value"),
    analysisText: document.getElementById("analysis-text"),
    themeTags: document.getElementById("theme-tags"),
    adviceList: document.getElementById("advice-list"),
    regenerateButton: document.getElementById("regenerate-btn"),
    startOverButton: document.getElementById("start-over-btn"),
    toastContainer: document.getElementById("toast-container"),
    themeToggle: document.getElementById("theme-toggle"),
    modal: document.getElementById("confirm-modal"),
    modalCancel: document.getElementById("modal-cancel"),
    modalConfirm: document.getElementById("modal-confirm"),
    developerPanel: document.getElementById("developer-panel"),
    developerPanelContent: document.getElementById("developer-panel-content"),
    developerPanelClose: document.getElementById("developer-panel-close")
  };

  const DEFAULT_STATE = () => ({
    stage: "wish",
    wishInput: "",
    wish: "",
    images: [],
    interpretations: Array(IMAGE_COUNT).fill(""),
    probability: null,
    analysis: "",
    themes: [],
    advice: [],
    imageSeed: null,
    themePreference: "auto"
  });

  let state = DEFAULT_STATE();
  let developerPanelVisible = false;

  function init() {
    loadState();
    bindEvents();
    applyStateToUI();
  }

  function bindEvents() {
    elements.wishForm.addEventListener("submit", handleWishSubmit);
    elements.wishInput.addEventListener("input", handleWishInput);
    elements.submitInterpretations.addEventListener("click", handleInterpretationsSubmit);
    elements.regenerateButton.addEventListener("click", handleRegenerateImages);
    elements.startOverButton.addEventListener("click", openModal);
    elements.modalCancel.addEventListener("click", closeModal);
    elements.modalConfirm.addEventListener("click", confirmReset);
    elements.modal.addEventListener("click", modalBackdropHandler);
    document.addEventListener("keydown", handleGlobalKeydown);
    elements.themeToggle.addEventListener("click", cycleTheme);
    if (elements.developerPanelClose) {
      elements.developerPanelClose.addEventListener("click", () => toggleDeveloperPanel(false));
    }
  }

  function handleWishInput(event) {
    state.wishInput = event.target.value;
    saveState();
  }

  function handleWishSubmit(event) {
    event.preventDefault();
    const wishValue = elements.wishInput.value.trim();

    if (wishValue.length < 3 || wishValue.length > 140) {
      elements.wishError.textContent = "Wish must be between 3 and 140 characters.";
      elements.wishInput.setAttribute("aria-invalid", "true");
      elements.wishInput.focus();
      return;
    }

    const hasExistingContent =
      (state.stage === "interpretation" || state.stage === "result") &&
      (state.interpretations.some((text) => text.trim().length > 0) || state.probability !== null);

    if (hasExistingContent && wishValue !== state.wish) {
      const proceed = window.confirm("Starting a new wish will clear current images and interpretations. Continue?");
      if (!proceed) {
        return;
      }
    }

    state.wishInput = wishValue;
    state.wish = wishValue;
    state.stage = "interpretation";
    state.interpretations = Array(IMAGE_COUNT).fill("");
    state.probability = null;
    state.analysis = "";
    state.themes = [];
    state.advice = [];
    state.imageSeed = null;

    elements.wishError.textContent = "";
    elements.wishInput.removeAttribute("aria-invalid");

    generateImages();
    updateStageView();
    renderResultSection();
    saveState();
    showToast("Images ready. Let intuition guide your interpretations!");
  }

  function generateImages() {
    if (!state.wish) {
      showToast("Please enter a wish before generating images.", "error");
      return;
    }

    const keywords = chooseKeywords(state.wish);
    const baseSeed = hashString(state.wish + Date.now().toString());
    state.imageSeed = baseSeed;

    state.images = Array.from({ length: IMAGE_COUNT }, (_, index) => {
      const keyword = keywords[index % keywords.length];
      return {
        url: `https://source.unsplash.com/featured/800x450?${encodeURIComponent(keyword)}&sig=${baseSeed + index}`,
        alt: `Abstract visualization inspired by ${keyword}`,
        keyword
      };
    });

    renderImageGrid();
  }

  function renderImageGrid() {
    elements.imageGrid.innerHTML = "";

    if (!state.images.length) {
      return;
    }

    state.images.forEach((image, index) => {
      const card = document.createElement("article");
      card.className = "image-card";
      card.setAttribute("role", "listitem");

      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.alt;
      img.loading = "lazy";
      img.addEventListener("error", () => handleImageError(img, index));
      figure.appendChild(img);

      const textarea = document.createElement("textarea");
      textarea.id = `interpretation-${index}`;
      textarea.dataset.index = String(index);
      textarea.maxLength = INTERPRETATION_LIMIT;
      textarea.placeholder = "Write your interpretation...";
      textarea.setAttribute("aria-label", `Interpretation for image ${index + 1}`);
      textarea.value = state.interpretations[index] || "";
      textarea.addEventListener("input", handleInterpretationInput);

      const counter = document.createElement("div");
      counter.className = "char-counter";
      counter.id = `${textarea.id}-counter`;
      counter.textContent = `${textarea.value.length}/${INTERPRETATION_LIMIT}`;

      card.appendChild(figure);
      card.appendChild(textarea);
      card.appendChild(counter);
      elements.imageGrid.appendChild(card);
    });

    updateSubmitButtonState();
  }

  function handleInterpretationInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;

    const index = Number(target.dataset.index);
    const value = target.value.slice(0, INTERPRETATION_LIMIT);
    target.value = value;

    state.interpretations[index] = value;
    const counter = document.getElementById(`${target.id}-counter`);
    if (counter) {
      counter.textContent = `${value.length}/${INTERPRETATION_LIMIT}`;
    }

    updateSubmitButtonState();
    saveState();
  }

  function updateSubmitButtonState() {
    const allFilled = state.interpretations.every((text) => text.trim().length > 0);
    elements.submitInterpretations.disabled = !allFilled;
  }

  function handleInterpretationsSubmit() {
    const allFilled = state.interpretations.every((text) => text.trim().length > 0);
    if (!allFilled) {
      showToast("Please interpret each image before submitting.", "error");
      return;
    }

    const combinedText = `${state.wish} ${state.interpretations.join(" ")}`;
    const { probability, themes, advice, narrative } = evaluateWish(combinedText);

    state.probability = probability;
    state.analysis = narrative;
    state.themes = themes;
    state.advice = advice;
    state.stage = "result";

    renderResultSection();
    updateStageView();
    saveState();
    showToast("Reading complete. Check your results!");
  }

  function evaluateWish(text) {
    const seed = hashString(text);
    const textScore = calculateTextScore(text);
    const randomScore = calculateRandomScore(seed);
    const probability = clamp(textScore + randomScore, 0, 100);

    const themes = extractThemes(text, seed);
    const advice = buildAdvice(probability, themes, seed);
    const narrative = buildNarrative(probability, state.wish, themes);

    return { probability, themes, advice, narrative };
  }

  function calculateTextScore(text) {
    const lower = text.toLowerCase();
    let score = 20;

    const positiveScore = countMatches(lower, POSITIVE_WORDS) * 6;
    score += Math.min(positiveScore, 36);

    const negativeScore = countMatches(lower, NEGATIVE_WORDS) * 7;
    score -= Math.min(negativeScore, 28);

    const timeMatches = lower.match(TIME_REGEX) || [];
    score += Math.min(timeMatches.length * 7, 21);

    return clamp(score, 0, 60);
  }

  function countMatches(text, wordList) {
    return wordList.reduce((count, word) => {
      const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "g");
      const matches = text.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  function calculateRandomScore(seed) {
    const randomValue = seededRandom(seed);
    return Math.round(randomValue * 40);
  }

  function buildNarrative(probability, wish, themes) {
    const formattedThemes = formatThemesForSentence(themes);
    const firstSentence = `Your wish "${wish}" draws on ${formattedThemes}.`;

    let moodSentence;
    if (probability >= 80) {
      moodSentence = "Momentum is strong—stay focused and celebrate each stride forward.";
    } else if (probability >= 60) {
      moodSentence = "A steady path is forming; refine your plan and keep acting with intention.";
    } else if (probability >= 40) {
      moodSentence = "The odds are warming up; consistent effort can tip the balance in your favor.";
    } else {
      moodSentence = "Treat this reading as a friendly nudge to recommit and set a clear first step.";
    }

    const closingSentence = "Approach each interpretation as a clue, not a command, and stay playful with the process.";
    return [firstSentence, moodSentence, closingSentence].join(" ");
  }

  function formatThemesForSentence(themes) {
    const capitalized = themes.length
      ? themes.map(capitalizeWord)
      : ["Persistence", "Balance", "Openness"];
    if (capitalized.length === 1) {
      return capitalized[0];
    }
    if (capitalized.length === 2) {
      return `${capitalized[0]} and ${capitalized[1]}`;
    }
    return `${capitalized.slice(0, -1).join(", ")}, and ${capitalized[capitalized.length - 1]}`;
  }

  function buildAdvice(probability, themes, seed) {
    const suggestions = [];
    const primaryTheme = themes[0] || "focus";
    const secondaryTheme = themes[1] || "balance";

    if (probability >= 80) {
      suggestions.push(`Put your ${primaryTheme} into action by scheduling a milestone this week.`);
    } else if (probability >= 60) {
      suggestions.push(`Channel your ${primaryTheme} by outlining the next two concrete steps.`);
    } else if (probability >= 40) {
      suggestions.push(`Anchor your progress in ${primaryTheme} with one repeatable habit.`);
    } else {
      suggestions.push(`Jump-start momentum by pairing ${primaryTheme} with one simple action today.`);
    }

    const positivePool = [
      `Share your intention with a trusted friend to keep ${secondaryTheme} alive.`,
      `Record a quick reflection after each effort so ${primaryTheme} keeps evolving.`,
      `Mark a recurring reminder—consistency fuels ${primaryTheme}.`,
      `Celebrate micro-wins to reinforce ${secondaryTheme}.`,
      `Translate each image insight into a five-minute action.`,
      `Blend ${primaryTheme} with self-care so energy stays high.`
    ];

    const randomIndex = Math.floor(seededRandom(seed + 17) * positivePool.length);
    suggestions.push(positivePool[randomIndex]);

    return suggestions.slice(0, 2);
  }

  function extractThemes(text, seed) {
    const words = (text.toLowerCase().match(/[a-z]{3,}/g) || []).filter((word) => !STOP_WORDS.has(word));
    const frequency = new Map();
    words.forEach((word) => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    const sorted = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word]) => word);

    while (sorted.length < 3) {
      const fallbackIndex = Math.floor(seededRandom(seed + sorted.length * 31) * FALLBACK_KEYWORDS.length);
      const fallback = FALLBACK_KEYWORDS[fallbackIndex];
      if (!sorted.includes(fallback)) {
        sorted.push(fallback);
      } else {
        sorted.push(`${fallback}-energy`);
      }
    }

    return sorted.slice(0, 3);
  }

  function handleRegenerateImages() {
    if (!state.wish) {
      showToast("Enter a wish before regenerating images.", "error");
      return;
    }

    const hasInterpretations = state.interpretations.some((text) => text.trim().length > 0);
    if (hasInterpretations) {
      const confirmReset = window.confirm("Regenerating images will clear your interpretations. Continue?");
      if (!confirmReset) {
        return;
      }
    }

    state.interpretations = Array(IMAGE_COUNT).fill("");
    state.probability = null;
    state.analysis = "";
    state.themes = [];
    state.advice = [];
    state.stage = "interpretation";

    generateImages();
    renderResultSection();
    updateStageView();
    saveState();
    showToast("New images summoned. See what stories they tell!");
  }

  function handleImageError(img, index) {
    if (img.dataset.fallback === "true") {
      return;
    }
    img.dataset.fallback = "true";
    const fallbackUrl = `${PLACEHOLDER_URL}${(state.imageSeed || Date.now()) + index}`;
    img.src = fallbackUrl;
    img.alt = "Placeholder visualization";
    showToast("An image failed to load and was replaced with a placeholder.", "error");
  }

  function renderResultSection() {
    if (state.probability === null) {
      elements.probabilityValue.textContent = "--%";
      elements.analysisText.textContent = "";
      elements.themeTags.innerHTML = "";
      elements.adviceList.innerHTML = "";
      return;
    }

    elements.probabilityValue.textContent = `${state.probability}%`;
    elements.analysisText.textContent = state.analysis;

    elements.themeTags.innerHTML = "";
    state.themes.forEach((theme) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = capitalizeWord(theme);
      elements.themeTags.appendChild(tag);
    });

    elements.adviceList.innerHTML = "";
    state.advice.forEach((tip) => {
      const item = document.createElement("li");
      item.textContent = tip;
      elements.adviceList.appendChild(item);
    });
  }

  function updateStageView() {
    if (state.stage === "wish") {
      elements.imagesSection.classList.add("hidden");
      elements.resultSection.classList.add("hidden");
    } else if (state.stage === "interpretation") {
      elements.imagesSection.classList.remove("hidden");
      elements.resultSection.classList.add("hidden");
    } else {
      elements.imagesSection.classList.remove("hidden");
      elements.resultSection.classList.remove("hidden");
    }
  }

  function applyStateToUI() {
    elements.wishInput.value = state.wishInput || state.wish || "";
    if (state.images.length) {
      renderImageGrid();
    }
    renderResultSection();
    updateStageView();
    applyThemePreference(state.themePreference);
  }

  function openModal() {
    elements.modal.classList.remove("hidden");
    elements.modalConfirm.focus();
  }

  function closeModal() {
    elements.modal.classList.add("hidden");
    elements.startOverButton.focus();
  }

  function confirmReset() {
    resetState();
    closeModal();
    showToast("Cleared. Ready for a brand-new wish!");
  }

  function modalBackdropHandler(event) {
    if (event.target === elements.modal) {
      closeModal();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      if (!elements.modal.classList.contains("hidden")) {
        closeModal();
        return;
      }
      if (developerPanelVisible) {
        toggleDeveloperPanel(false);
        return;
      }
    }

    const wantsDevToggle =
      event.key.toLowerCase() === "d" &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey;
    if (wantsDevToggle) {
      event.preventDefault();
      toggleDeveloperPanel();
    }
  }

  function resetState() {
    state = DEFAULT_STATE();
    elements.wishInput.value = "";
    elements.wishError.textContent = "";
    elements.imageGrid.innerHTML = "";
    renderResultSection();
    updateStageView();
    saveState();
  }

  function cycleTheme() {
    const currentIndex = THEME_SEQUENCE.indexOf(state.themePreference || "auto");
    const nextValue = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
    applyThemePreference(nextValue);
    saveState();
  }

  function applyThemePreference(preference) {
    state.themePreference = preference;
    elements.body.dataset.theme = preference;
    if (preference === "auto") {
      elements.themeToggle.textContent = "Auto Theme";
    } else if (preference === "light") {
      elements.themeToggle.textContent = "Light Mode";
    } else {
      elements.themeToggle.textContent = "Dark Mode";
    }
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      state = {
        ...DEFAULT_STATE(),
        ...parsed,
        interpretations: Array.isArray(parsed?.interpretations)
          ? parsed.interpretations.concat(Array(IMAGE_COUNT).fill("")).slice(0, IMAGE_COUNT)
          : Array(IMAGE_COUNT).fill(""),
        images: Array.isArray(parsed?.images) ? parsed.images.slice(0, IMAGE_COUNT) : [],
        themes: Array.isArray(parsed?.themes) ? parsed.themes.slice(0, 3) : [],
        advice: Array.isArray(parsed?.advice) ? parsed.advice.slice(0, 2) : []
      };
      if (!["wish", "interpretation", "result"].includes(state.stage)) {
        state.stage = "wish";
      }
    } catch (error) {
      showToast("Could not load your previous session. Starting fresh.", "error");
      state = DEFAULT_STATE();
    }
  }

  function saveState() {
    const payload = buildPersistedState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      showToast("Storage is unavailable. Progress may not be saved.", "error");
    }
    refreshDeveloperPanel(payload);
  }

  function buildPersistedState() {
    return {
      stage: state.stage,
      wishInput: state.wishInput,
      wish: state.wish,
      images: state.images,
      interpretations: state.interpretations,
      probability: state.probability,
      analysis: state.analysis,
      themes: state.themes,
      advice: state.advice,
      imageSeed: state.imageSeed,
      themePreference: state.themePreference
    };
  }

  function toggleDeveloperPanel(forceState) {
    if (!elements.developerPanel) return;
    const nextVisible =
      typeof forceState === "boolean" ? forceState : !developerPanelVisible;
    developerPanelVisible = nextVisible;
    elements.developerPanel.hidden = !nextVisible;
    if (nextVisible) {
      refreshDeveloperPanel();
    }
  }

  function refreshDeveloperPanel(persistedSnapshot) {
    if (!developerPanelVisible || !elements.developerPanelContent) return;
    const payload = persistedSnapshot || buildPersistedState();
    const compact = JSON.stringify(payload);
    const derived = {
      updatedAt: new Date().toISOString(),
      interpretationsFilled: payload.interpretations.filter((text) => text.trim().length > 0).length,
      imagesReady: payload.images.length,
      storageBytes: compact.length
    };
    const snapshot = {
      ...derived,
      stage: payload.stage,
      wishInput: payload.wishInput,
      wish: payload.wish,
      probability: payload.probability,
      analysis: payload.analysis,
      interpretations: payload.interpretations,
      themes: payload.themes,
      advice: payload.advice,
      images: payload.images.map((image, index) => ({
        index,
        keyword: image.keyword,
        url: image.url
      })),
      imageSeed: payload.imageSeed,
      themePreference: payload.themePreference
    };
    elements.developerPanelContent.textContent = JSON.stringify(snapshot, null, 2);
    elements.developerPanelContent.scrollTop = 0;
  }

  function chooseKeywords(wishText) {
    const words = (wishText.toLowerCase().match(/[a-z]+/g) || []).filter((word) => !STOP_WORDS.has(word));
    const unique = [];
    words.forEach((word) => {
      if (!unique.includes(word) && word.length > 2) {
        unique.push(word);
      }
    });

    if (!unique.length) {
      return pickFallbackKeywords(hashString(wishText));
    }

    if (unique.length === 1) {
      const fallback = pickFallbackKeywords(hashString(unique[0]));
      return [unique[0], fallback[0]];
    }

    return unique.slice(0, 2);
  }

  function pickFallbackKeywords(seed) {
    const firstIndex = Math.floor(seededRandom(seed) * FALLBACK_KEYWORDS.length);
    let secondIndex = Math.floor(seededRandom(seed + 13) * FALLBACK_KEYWORDS.length);
    if (secondIndex === firstIndex) {
      secondIndex = (secondIndex + 1) % FALLBACK_KEYWORDS.length;
    }
    return [FALLBACK_KEYWORDS[firstIndex], FALLBACK_KEYWORDS[secondIndex]];
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967295;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function clamp(number, min, max) {
    return Math.max(min, Math.min(number, max));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function capitalizeWord(word) {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function showToast(message, type = "info") {
    if (!elements.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`.trim();
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("fade-out");
      toast.addEventListener(
        "transitionend",
        () => {
          toast.remove();
        },
        { once: true }
      );
    }, 3800);
  }

  init();

  // Test ideas:
  // 1. Validate that wishes shorter than 3 characters show the appropriate error.
  // 2. Verify that entering exactly 140 characters passes validation.
  // 3. Confirm that regenerating images after filling interpretations prompts for confirmation.
  // 4. Ensure localStorage retains wish, images, and interpretations across reloads.
  // 5. Check that probability score remains consistent for identical input text.
  // 6. Confirm random score stays within 0-40 across multiple hashes.
  // 7. Validate character counters cap interpretations at 200 characters.
  // 8. Simulate image load failure and confirm fallback image and toast appear.
  // 9. Test theme toggle cycles auto → light → dark and persists after reload.
  // 10. Confirm “Start Over” modal clears all state only after confirmation.
})();
