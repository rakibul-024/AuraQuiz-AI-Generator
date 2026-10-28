/**
 * AuraQuiz - Application Logic Controller
 * Uses the user's selected Google Gemini model for quiz generation.
 */

// --- Global Application State ---
const state = {
  apiKey: '',
  availableModels: [],
  selectedModel: localStorage.getItem('aura_quiz_gemini_model') || '',
  currentScreen: 'screen-dashboard',
  quizData: null,
  currentQuestionIndex: 0,
  selectedAnswers: [], // Stores index of selected options
  timerInterval: null,
  secondsElapsed: 0,
  questionSecondsLeft: 45, // Countdown timer per question
  theme: localStorage.getItem('aura_quiz_theme') || 'dark',
  generationProgressInterval: null
};

// --- DOM Element Selectors ---
const DOM = {
  // Screens
  screens: {
    setup: document.getElementById('screen-setup'),
    dashboard: document.getElementById('screen-dashboard'),
    loading: document.getElementById('screen-loading'),
    quiz: document.getElementById('screen-quiz'),
    results: document.getElementById('screen-results')
  },

  // Header Elements
  btnChangeKey: document.getElementById('btn-change-key'),

  // Setup Screen
  formApiKey: document.getElementById('form-api-key'),
  inputApiKey: document.getElementById('input-api-key'),
  setupFeedback: document.getElementById('setup-feedback'),
  btnSubmitKey: document.getElementById('btn-submit-key'),
  btnContinueWithoutKey: document.getElementById('btn-continue-without-key'),

  // Dashboard Screen
  formQuizConfig: document.getElementById('form-quiz-config'),
  inputTopic: document.getElementById('input-topic'),
  suggestionChips: document.querySelectorAll('.suggestion-chip'),
  selectDifficulty: document.getElementById('select-difficulty'),
  selectCount: document.getElementById('select-count'),
  selectStyle: document.getElementById('select-style'),
  selectModel: document.getElementById('select-model'),
  modelStatus: document.getElementById('model-status'),
  btnRefreshModels: document.getElementById('btn-refresh-models'),
  btnGenerate: document.getElementById('btn-generate'),

  // Loading Screen
  loaderStatusText: document.getElementById('loader-status-text'),
  loaderProgressBar: document.getElementById('loader-progress-bar'),

  // Quiz Screen
  quizMetaTopic: document.getElementById('quiz-meta-topic'),
  quizTimer: document.getElementById('quiz-timer'),
  currentQuestionNum: document.getElementById('current-question-num'),
  totalQuestionsCount: document.getElementById('total-questions-count'),
  progressPercentLabel: document.getElementById('progress-percent-label'),
  quizProgressFill: document.getElementById('quiz-progress-fill'),
  quizQuestionText: document.getElementById('quiz-question-text'),
  quizOptionsContainer: document.getElementById('quiz-options-container'),
  btnPrevQuestion: document.getElementById('btn-prev-question'),
  btnNextQuestion: document.getElementById('btn-next-question'),

  // Results Screen
  resultsScorePercent: document.getElementById('results-score-percent'),
  scoreCircle: document.getElementById('score-circle'),
  resultsFeedbackTitle: document.getElementById('results-feedback-title'),
  resultsTimeTaken: document.getElementById('results-time-taken'),
  resultsStatScore: document.getElementById('results-stat-score'),
  resultsStatCorrect: document.getElementById('results-stat-correct'),
  resultsStatIncorrect: document.getElementById('results-stat-incorrect'),
  btnRestartQuiz: document.getElementById('btn-restart-quiz'),
  btnNewQuiz: document.getElementById('btn-new-quiz'),
  resultsReviewList: document.getElementById('results-review-list')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem('aura_quiz_gemini_key') || '';
  state.apiKey = savedKey;
  document.getElementById('copyright-year').textContent = new Date().getFullYear();

  setupEventListeners();
  initTheme();
  checkInitialState();
  if (state.apiKey) {
    showModelStatus('Loading the latest available Gemini models...', 'info');
    refreshGeminiModels().catch(err => {
      showModelStatus(err.message, 'error');
    });
  }
});

// --- Theme Management ---
function initTheme() {
  setTheme(state.theme);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('aura_quiz_theme', theme);

  const iconSun = document.getElementById('theme-icon-sun');
  const iconMoon = document.getElementById('theme-icon-moon');
  if (theme === 'light') {
    if (iconSun) iconSun.classList.remove('hidden');
    if (iconMoon) iconMoon.classList.add('hidden');
  } else {
    if (iconSun) iconSun.classList.add('hidden');
    if (iconMoon) iconMoon.classList.remove('hidden');
  }
}

// --- Routing & Screen Management ---
function showScreen(screenId) {
  // Hide all screens
  Object.values(DOM.screens).forEach(screen => {
    if (screen) screen.classList.remove('active');
  });

  // Show target screen
  const target = DOM.screens[screenId.replace('screen-', '')];
  if (target) {
    target.classList.add('active');
    state.currentScreen = screenId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Header button visibility depending on screen
  if (state.currentScreen === 'screen-setup' || state.currentScreen === 'screen-loading') {
    DOM.btnChangeKey.classList.add('hidden');
  } else {
    DOM.btnChangeKey.classList.remove('hidden');
  }
}

function checkInitialState() {
  if (DOM.inputApiKey) {
    DOM.inputApiKey.value = state.apiKey;
  }
  renderModelOptions();
  showScreen('screen-dashboard');
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Theme Switcher Toggle Click
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }

  // Category Cards clicks
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const topic = card.getAttribute('data-topic');
      if (topic) {
        DOM.inputTopic.value = topic;
        DOM.inputTopic.focus();
      }
    });
  });

  // Logo Click Event: Return to Dashboard if not already there
  const logoArea = document.getElementById('logo-area');
  if (logoArea) {
    logoArea.addEventListener('click', () => {
      if (state.currentScreen !== 'screen-dashboard' && state.currentScreen !== 'screen-setup') {
        if (state.currentScreen === 'screen-quiz') {
          if (!confirm('Are you sure you want to quit the current quiz? Your progress will be lost.')) {
            return;
          }
          stopTimer();
        }
        showScreen('screen-dashboard');
      }
    });
  }

  // AI setup is optional; the dashboard is accessible without a key.
  DOM.formApiKey.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = DOM.inputApiKey.value.trim();
    if (!key) {
      showScreen('screen-dashboard');
      return;
    }

    setSetupLoading(true);
    showFeedback('Checking the key and loading available Gemini models...', 'info');
    try {
      const models = await fetchAvailableGeminiModels(key);
      state.apiKey = key;
      state.availableModels = models;
      localStorage.setItem('aura_quiz_gemini_key', key);
      renderModelOptions();
      showFeedback('AI key saved and available models loaded.', 'success');
      showModelStatus(`Loaded ${models.length} available Gemini models.`, 'success');
      setTimeout(() => {
        DOM.setupFeedback.classList.add('hidden');
        showScreen('screen-dashboard');
      }, 700);
    } catch (err) {
      showFeedback(err.message, 'error');
    } finally {
      setSetupLoading(false);
    }
  });

  DOM.btnContinueWithoutKey.addEventListener('click', () => {
    DOM.setupFeedback.classList.add('hidden');
    showScreen('screen-dashboard');
  });

  // AI settings button
  DOM.btnChangeKey.addEventListener('click', () => {
    if (state.currentScreen === 'screen-quiz') {
      if (!confirm('Are you sure you want to exit the current quiz to edit AI settings?')) {
        return;
      }
      stopTimer();
    }
    if (DOM.inputApiKey) {
      DOM.inputApiKey.value = state.apiKey;
    }
    showScreen('screen-setup');
  });

  DOM.selectModel.addEventListener('change', () => {
    state.selectedModel = DOM.selectModel.value;
    localStorage.setItem('aura_quiz_gemini_model', state.selectedModel);
  });

  DOM.btnRefreshModels.addEventListener('click', async () => {
    if (!state.apiKey) {
      showModelStatus('Add an AI key in AI Settings before refreshing models.', 'error');
      return;
    }
    DOM.btnRefreshModels.disabled = true;
    showModelStatus('Checking for newly available Gemini models...', 'info');
    try {
      await refreshGeminiModels();
      showModelStatus(`Model list updated (${state.availableModels.length} available).`, 'success');
    } catch (err) {
      showModelStatus(err.message, 'error');
    } finally {
      DOM.btnRefreshModels.disabled = false;
    }
  });

  // Topic Suggestion Chips
  DOM.suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.inputTopic.value = chip.textContent;
      DOM.inputTopic.focus();
    });
  });

  // Quiz Configuration Submission
  DOM.formQuizConfig.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = DOM.inputTopic.value.trim();
    const difficulty = DOM.selectDifficulty.value;
    const count = parseInt(DOM.selectCount.value, 10);
    const style = DOM.selectStyle.value;

    if (!topic) return;
    if (!state.apiKey) {
      showFeedback('A Gemini API key is needed to generate quizzes. You can still use the app without signing in.', 'error');
      showScreen('screen-setup');
      return;
    }

    // Transition to loading
    showScreen('screen-loading');
    startLoaderSimulation();

    try {
      const quiz = await fetchQuizFromGemini(topic, difficulty, count, style);
      stopLoaderSimulation();

      if (quiz && quiz.questions && quiz.questions.length > 0) {
        startQuiz(quiz, topic);
      } else {
        throw new Error('Malformed response received from API.');
      }
    } catch (err) {
      console.error(err);
      stopLoaderSimulation();
      showScreen('screen-dashboard');
      alert(`Generation Failed: ${err.message || 'Please check your connection and try again.'}`);
    }
  });

  // Quiz Navigation Button listeners
  DOM.btnPrevQuestion.addEventListener('click', () => {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex--;
      renderQuestion();
    }
  });

  DOM.btnNextQuestion.addEventListener('click', () => {
    const selected = state.selectedAnswers[state.currentQuestionIndex];
    if (selected === undefined || selected === null) {
      alert('Please select an option before moving forward.');
      return;
    }

    if (state.currentQuestionIndex < state.quizData.questions.length - 1) {
      state.currentQuestionIndex++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  });

  // Results Buttons
  DOM.btnRestartQuiz.addEventListener('click', () => {
    // Reset answers
    state.selectedAnswers = new Array(state.quizData.questions.length).fill(null);
    state.currentQuestionIndex = 0;
    startQuiz(state.quizData, state.quizData.title);
  });

  DOM.btnNewQuiz.addEventListener('click', () => {
    state.quizData = null;
    showScreen('screen-dashboard');
  });
}

// --- Gemini Model Discovery & Setup Helpers ---
async function fetchAvailableGeminiModels(key) {
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
  url.searchParams.set('key', key);
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Could not load models (HTTP ${response.status}). Check the API key and try again.`);
  }

  const models = (data.models || [])
    .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
    .map(model => ({
      name: model.name.replace(/^models\//, ''),
      displayName: model.displayName || model.name.replace(/^models\//, '')
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (!models.length) {
    throw new Error('This API key has no Gemini models that support content generation.');
  }
  return models;
}

async function refreshGeminiModels() {
  const models = await fetchAvailableGeminiModels(state.apiKey);
  state.availableModels = models;
  renderModelOptions();
  return models;
}

function renderModelOptions() {
  if (!DOM.selectModel) return;
  const preferredModel = state.selectedModel;
  DOM.selectModel.replaceChildren();

  state.availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.displayName;
    DOM.selectModel.appendChild(option);
  });

  if (state.availableModels.length) {
    const selectedModel = state.availableModels.find(model => model.name === preferredModel)
      || state.availableModels.find(model => /flash/i.test(model.name))
      || state.availableModels[0];
    state.selectedModel = selectedModel.name;
    DOM.selectModel.value = selectedModel.name;
    DOM.selectModel.disabled = false;
    localStorage.setItem('aura_quiz_gemini_model', state.selectedModel);
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = state.apiKey ? 'Loading available models...' : 'Add an AI key to load models';
    DOM.selectModel.appendChild(option);
    DOM.selectModel.disabled = true;
  }
}

function showModelStatus(message, type) {
  if (DOM.modelStatus) {
    DOM.modelStatus.textContent = message;
    DOM.modelStatus.dataset.state = type;
  }

  if (type === 'error' && !state.availableModels.length && DOM.selectModel) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = state.apiKey ? 'Could not load models — check AI Settings' : 'Add an AI key to load models';
    DOM.selectModel.replaceChildren(option);
    DOM.selectModel.disabled = true;
  }
}

function showFeedback(message, type) {
  if (DOM.setupFeedback) {
    DOM.setupFeedback.textContent = message;
    DOM.setupFeedback.className = `feedback-message feedback-${type}`;
    DOM.setupFeedback.classList.remove('hidden');
  }
}

function setSetupLoading(isLoading) {
  if (DOM.btnSubmitKey && DOM.inputApiKey) {
    DOM.btnSubmitKey.disabled = isLoading;
    DOM.inputApiKey.disabled = isLoading;
    const btnText = DOM.btnSubmitKey.querySelector('span');
    if (btnText) {
      if (isLoading) {
        btnText.textContent = 'Checking key and models...';
      } else {
        btnText.textContent = 'Save AI Key & Continue';
      }
    }
    if (DOM.btnContinueWithoutKey) {
      DOM.btnContinueWithoutKey.disabled = isLoading;
    }
  }
}

// --- Loader Simulation ---
function startLoaderSimulation() {
  let progress = 0;
  const statuses = [
    'Structuring request prompt...',
    'Establishing connection with Google AI Studio...',
    'Consulting Gemini knowledge systems...',
    'Analyzing topic and creating custom questions...',
    'Verifying question difficulty levels...',
    'Generating distractors and answer options...',
    'Validating JSON response structures...',
    'Polishing explanations and details...'
  ];

  DOM.loaderProgressBar.style.width = '0%';
  DOM.loaderStatusText.textContent = statuses[0];

  state.generationProgressInterval = setInterval(() => {
    // Increase progress slowly up to 92%, wait for actual fetch API completion
    if (progress < 92) {
      progress += Math.floor(Math.random() * 8) + 2;
      if (progress > 92) progress = 92;

      DOM.loaderProgressBar.style.width = `${progress}%`;

      // Rotate statuses
      const statusIdx = Math.min(
        Math.floor((progress / 100) * statuses.length),
        statuses.length - 1
      );
      DOM.loaderStatusText.textContent = statuses[statusIdx];
    }
  }, 400);
}

function stopLoaderSimulation() {
  clearInterval(state.generationProgressInterval);
  DOM.loaderProgressBar.style.width = '100%';
}

// --- Gemini Content Fetcher ---
async function fetchQuizFromGemini(topic, difficulty, count, style) {
  const apiKey = state.apiKey;
  const models = [
    state.selectedModel,
    ...state.availableModels.map(model => model.name)
  ].filter((model, index, list) => model && list.indexOf(model) === index);
  if (!models.length) {
    throw new Error('No Gemini models are available. Refresh the model list in AI Settings.');
  }

  const systemPrompt = `You are an expert educator and quiz builder. 
Create a customized, comprehensive quiz about "${topic}" matching the following settings:
- Difficulty: ${difficulty}
- Total Questions: ${count}
- Tone/Style: ${style}

IMPORTANT REQUIREMENT:
- Generate unique multiple-choice questions.
- Each question must have exactly 4 options.
- Choose clear distractors and exactly one clearly correct answer.
- Provide a detailed and friendly explanation for each question explaining why the correct answer is right and why other options are incorrect.
- Ensure the correctAnswer is one of the choices exactly as spelled.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          questions: {
            type: 'ARRAY',
            description: `List of exactly ${count} quiz questions`,
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                options: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: 'Exactly 4 distinct answers for the question'
                },
                correctAnswer: { type: 'STRING', description: 'The exact string representation of the correct answer option' },
                explanation: { type: 'STRING', description: 'A detailed breakdown explanation of the concept' }
              },
              required: ['question', 'options', 'correctAnswer', 'explanation']
            }
          }
        },
        required: ['title', 'questions']
      }
    }
  };

  let lastError = null;

  for (const model of models) {
    try {
      if (DOM.loaderStatusText) {
        DOM.loaderStatusText.textContent = `Connecting via ${model}...`;
      }
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
      url.searchParams.set('key', apiKey);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${response.status}`;
        console.warn(`[${model}] failed: ${errMsg}`);
        lastError = new Error(errMsg);
        continue; // try next model
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error(`No content returned by ${model}.`);
        continue;
      }

      return JSON.parse(cleanJSONString(rawText));

    } catch (err) {
      console.warn(`[${model}] exception:`, err.message);
      lastError = err;
      // continue to next model
    }
  }

  throw lastError || new Error('All available Gemini models failed. Check your API key and quota at https://aistudio.google.com/');
}

function cleanJSONString(rawText) {
  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(json)?\s*/i, '');
    text = text.replace(/\s*```$/, '');
  }
  return text.trim();
}

// --- Quiz Gameplay Implementation ---
function startQuiz(quiz, topic) {
  state.quizData = quiz;
  state.currentQuestionIndex = 0;
  state.selectedAnswers = new Array(quiz.questions.length).fill(null);

  DOM.quizMetaTopic.textContent = topic;
  DOM.totalQuestionsCount.textContent = quiz.questions.length;

  showScreen('screen-quiz');
  startTimer();
  renderQuestion();
}

function renderQuestion() {
  const currentQuestion = state.quizData.questions[state.currentQuestionIndex];

  // Reset question timer countdown
  state.questionSecondsLeft = 45;
  DOM.quizTimer.textContent = '45s';
  DOM.quizTimer.classList.remove('warning');
  const dialFill = document.getElementById('timer-dial-fill');
  if (dialFill) {
    dialFill.setAttribute('stroke-dasharray', '100, 100');
    dialFill.classList.remove('warning');
  }

  // Progress indicators
  DOM.currentQuestionNum.textContent = state.currentQuestionIndex + 1;
  const progressPercent = Math.round(((state.currentQuestionIndex) / state.quizData.questions.length) * 100);
  DOM.progressPercentLabel.textContent = `${progressPercent}%`;
  DOM.quizProgressFill.style.width = `${progressPercent}%`;

  // Question text
  DOM.quizQuestionText.textContent = currentQuestion.question;

  // Clear choices
  DOM.quizOptionsContainer.innerHTML = '';

  // Render options
  currentQuestion.options.forEach((option, idx) => {
    const optionPrefixLetter = String.fromCharCode(65 + idx); // A, B, C, D
    const optionBtn = document.createElement('button');
    optionBtn.className = 'option-btn';

    // Check if previously selected
    if (state.selectedAnswers[state.currentQuestionIndex] === idx) {
      optionBtn.classList.add('active');
    }

    optionBtn.innerHTML = `
      <span class="option-prefix">${optionPrefixLetter}</span>
      <span class="option-content"></span>
    `;
    // Prevent HTML injection by assigning textContent
    optionBtn.querySelector('.option-content').textContent = option;

    optionBtn.addEventListener('click', () => {
      selectOption(idx);
    });

    DOM.quizOptionsContainer.appendChild(optionBtn);
  });

  // Update Buttons - Back button is disabled for the timed quiz mode
  DOM.btnPrevQuestion.disabled = true;

  const isLastQuestion = state.currentQuestionIndex === state.quizData.questions.length - 1;
  const nextBtnSpan = DOM.btnNextQuestion.querySelector('span');
  const nextBtnSvg = DOM.btnNextQuestion.querySelector('svg');

  if (isLastQuestion) {
    nextBtnSpan.textContent = 'Submit Quiz';
    nextBtnSvg.innerHTML = `<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>`;
  } else {
    nextBtnSpan.textContent = 'Next';
    nextBtnSvg.innerHTML = `<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`;
  }
}

function selectOption(index) {
  state.selectedAnswers[state.currentQuestionIndex] = index;

  // Update UI selection classes
  const buttons = DOM.quizOptionsContainer.querySelectorAll('.option-btn');
  buttons.forEach((btn, idx) => {
    if (idx === index) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// --- Gameplay Timer ---
function startTimer() {
  stopTimer();
  state.secondsElapsed = 0;
  state.questionSecondsLeft = 45;
  DOM.quizTimer.textContent = '45s';
  DOM.quizTimer.classList.remove('warning');

  const dialFill = document.getElementById('timer-dial-fill');
  if (dialFill) {
    dialFill.setAttribute('stroke-dasharray', '100, 100');
    dialFill.classList.remove('warning');
  }

  state.timerInterval = setInterval(() => {
    state.secondsElapsed++;
    state.questionSecondsLeft--;

    // Update display
    DOM.quizTimer.textContent = `${state.questionSecondsLeft}s`;

    // Update dial progress
    if (dialFill) {
      const percentage = (state.questionSecondsLeft / 45) * 100;
      dialFill.setAttribute('stroke-dasharray', `${percentage}, 100`);
      if (state.questionSecondsLeft <= 10) {
        dialFill.classList.add('warning');
      } else {
        dialFill.classList.remove('warning');
      }
    }

    // Warn user when <= 10 seconds left
    if (state.questionSecondsLeft <= 10) {
      DOM.quizTimer.classList.add('warning');
    } else {
      DOM.quizTimer.classList.remove('warning');
    }

    // Check if time is up
    if (state.questionSecondsLeft <= 0) {
      handleQuestionTimeUp();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function handleQuestionTimeUp() {
  // Save answer as null if not already answered
  if (state.selectedAnswers[state.currentQuestionIndex] === null) {
    state.selectedAnswers[state.currentQuestionIndex] = null;
  }

  // Go to next question
  if (state.currentQuestionIndex < state.quizData.questions.length - 1) {
    state.currentQuestionIndex++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function getFormattedTimerValue(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// --- Results Calculation & Render ---
function finishQuiz() {
  stopTimer();

  const questions = state.quizData.questions;
  let correctCount = 0;

  // Compile Results
  const reviewData = questions.map((q, qIdx) => {
    const selectedIdx = state.selectedAnswers[qIdx];
    const selectedText = q.options[selectedIdx];

    // Check correctness: string equality
    const isCorrect = selectedText === q.correctAnswer;
    if (isCorrect) correctCount++;

    return {
      question: q.question,
      options: q.options,
      selectedText,
      selectedIdx,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      isCorrect
    };
  });

  const totalQuestions = questions.length;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);

  // 1. Circular Progress Animation
  DOM.resultsScorePercent.textContent = `${scorePercent}%`;
  // dasharray controls the stroke length relative to radius (dash offset is 100 max)
  DOM.scoreCircle.setAttribute('stroke-dasharray', `${scorePercent}, 100`);

  // Set stroke color matching score
  if (scorePercent >= 80) {
    DOM.scoreCircle.style.stroke = 'var(--success-color)';
    DOM.resultsFeedbackTitle.textContent = 'Outstanding Mastery! 🏆';
  } else if (scorePercent >= 50) {
    DOM.scoreCircle.style.stroke = 'var(--primary-color)';
    DOM.resultsFeedbackTitle.textContent = 'Great Effort! 👍';
  } else {
    DOM.scoreCircle.style.stroke = 'var(--danger-color)';
    DOM.resultsFeedbackTitle.textContent = 'Keep Practicing! 📚';
  }

  // 2. Metadata details
  DOM.resultsTimeTaken.textContent = getFormattedTimerValue(state.secondsElapsed);
  DOM.resultsStatScore.textContent = `${correctCount}/${totalQuestions}`;
  DOM.resultsStatCorrect.textContent = correctCount;
  DOM.resultsStatIncorrect.textContent = totalQuestions - correctCount;

  // 3. Render detailed solution list
  renderReviewList(reviewData);

  // Transition to results screen
  showScreen('screen-results');
}

function renderReviewList(reviewData) {
  DOM.resultsReviewList.innerHTML = '';

  reviewData.forEach((item, index) => {
    const reviewCard = document.createElement('div');
    reviewCard.className = 'card review-card glass-card';

    // Status text & class
    const statusText = item.isCorrect ? 'Correct' : 'Incorrect';
    const statusClass = item.isCorrect ? 'status-correct' : 'status-wrong';

    let optionsHtml = '';
    item.options.forEach((opt, optIdx) => {
      const optionLetter = String.fromCharCode(65 + optIdx);
      let selectClass = '';

      // If correct option, color green
      if (opt === item.correctAnswer) {
        selectClass = 'correct-choice';
      }
      // If user selected this wrong option, color red
      else if (optIdx === item.selectedIdx && !item.isCorrect) {
        selectClass = 'wrong-choice';
      }

      optionsHtml += `
        <div class="review-option ${selectClass}">
          <span class="review-option-indicator">${optionLetter}</span>
          <span class="review-option-content">${escapeHtml(opt)}</span>
        </div>
      `;
    });

    reviewCard.innerHTML = `
      <div class="review-card-header">
        <span class="review-card-num">Q${index + 1}</span>
        <span class="review-card-status ${statusClass}">${statusText}</span>
      </div>
      <div class="review-question">${escapeHtml(item.question)}</div>
      <div class="review-options">
        ${optionsHtml}
      </div>
      <div class="review-explanation">
        <div class="explanation-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>Gemini Explanation</span>
        </div>
        <div class="explanation-body">${escapeHtml(item.explanation)}</div>
      </div>
    `;

    DOM.resultsReviewList.appendChild(reviewCard);
  });
}

// Simple HTML escaping to prevent UI breaks
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
