'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const API_ROOT = configuredApiUrl.endsWith('/api') ? configuredApiUrl : `${configuredApiUrl}/api`;
const STUDY_TYPES = [
  ['revision', 'Revision'],
  ['lecture', 'Lecture'],
  ['q_solve', 'Question solving'],
  ['test', 'Test'],
  ['analysis', 'Analysis'],
];
const TYPE_LABEL = Object.fromEntries(STUDY_TYPES);
const TYPE_COLOR = {
  revision: '#547f65',
  lecture: '#6782a0',
  q_solve: '#cb8c52',
  test: '#9a78a2',
  analysis: '#6e9c9a',
};

function utcDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, count) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return utcDate(value);
}

function mondayFor(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return utcDate(value);
}

function localInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function timestampFromInput(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatSeconds(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m`;
  return `${total % 60}s`;
}

function formatClock(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00.000Z`));
}

function formatTime(value) {
  if (!value) return 'In progress';
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${API_ROOT}${path}`;
  const startedAt = performance.now();
  let responseReceived = false;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      cache: 'no-store',
    });
    responseReceived = true;
    const data = await response.json().catch(() => null);
    const trace = { method, path, status: response.status, durationMs: Math.round(performance.now() - startedAt) };
    if (!response.ok) {
      console.error('[GATE API] request failed', { ...trace, error: data?.error || `Request failed (${response.status})` });
      throw new Error(data?.error || `Request failed (${response.status})`);
    }
    console.info('[GATE API] request succeeded', trace);
    return data;
  } catch (error) {
    if (!responseReceived) {
      console.error('[GATE API] network/request error', {
        method, path, durationMs: Math.round(performance.now() - startedAt), message: error.message,
      });
    }
    throw error;
  }
}

function metricValue(row, type) {
  if (!row) return 0;
  return type ? Number(row[`${type}_seconds`] || 0) : Number(row.total_seconds || 0);
}

function initialSatelliteForm(session) {
  const satellite = session?.satellite || {};
  return {
    revision_number: satellite.revision_number ?? '',
    topic: satellite.topic ?? '',
    topics: satellite.topics ?? '',
    notes: satellite.notes ?? '',
    questions_attempted: satellite.questions_attempted ?? 0,
    questions_correct: satellite.questions_correct ?? 0,
    questions_wrong: satellite.questions_wrong ?? 0,
    test_name: satellite.test_name ?? '',
    score: satellite.score ?? '',
    max_score: satellite.max_score ?? '',
    analysis_type: satellite.analysis_type ?? '',
    findings: satellite.findings ?? '',
    action_items: satellite.action_items ?? '',
  };
}

export default function Home() {
  const [view, setView] = useState('overview');
  const [theme, setTheme] = useState('light');
  const [today, setToday] = useState(() => utcDate());
  const [selectedDate, setSelectedDate] = useState(() => utcDate());
  const [todayHours, setTodayHours] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [streakDays, setStreakDays] = useState([]);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [dailyRange, setDailyRange] = useState([]);
  const [weeklyRange, setWeeklyRange] = useState([]);
  const [rangeFrom, setRangeFrom] = useState(() => addDays(utcDate(), -6));
  const [rangeTo, setRangeTo] = useState(() => utcDate());
  const [hours, setHours] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionFilter, setSessionFilter] = useState('day');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [studyTypeFilter, setStudyTypeFilter] = useState('');
  const [subs, setSubs] = useState([]);
  const [questionTotals, setQuestionTotals] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionEdit, setSessionEdit] = useState(null);
  const [satelliteEdit, setSatelliteEdit] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [dailyTargetHours, setDailyTargetHours] = useState(4);
  const [pausedSessionId, setPausedSessionId] = useState('');
  const [pauseStateLoaded, setPauseStateLoaded] = useState(false);
  const [startForm, setStartForm] = useState({ sub_id: '', study_type: 'revision', started_at: '', topics: '', note: '' });
  const mutationLock = useRef(false);
  const initialRefreshStarted = useRef(false);
  const rolloverLock = useRef(false);
  const pendingRolloverRefresh = useRef(null);
  const skipRolloverDateEffect = useRef(false);

  const selectedSubject = useMemo(() => new Map(subs.map((subject) => [Number(subject.id), subject])), [subs]);
  const questionSummary = useMemo(() => questionTotals.reduce((sum, row) => ({
    attempted: sum.attempted + Number(row.total_attempted || 0),
    correct: sum.correct + Number(row.total_correct || 0),
    wrong: sum.wrong + Number(row.total_wrong || 0),
  }), { attempted: 0, correct: 0, wrong: 0 }), [questionTotals]);
  const subjectStudy = useMemo(() => {
    const totals = new Map();
    for (const row of hours) totals.set(Number(row.sub_id), (totals.get(Number(row.sub_id)) || 0) + Number(row.seconds || 0));
    return [...totals.entries()].map(([subId, seconds]) => ({ subId, seconds, name: selectedSubject.get(subId)?.name || `Subject #${subId}` }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [hours, selectedSubject]);
  const filteredSessions = useMemo(() => sessions.filter((session) =>
    (!subjectFilter || Number(session.sub_id) === Number(subjectFilter)) &&
    (!studyTypeFilter || session.study_type === studyTypeFilter)), [sessions, subjectFilter, studyTypeFilter]);
  const streak = useMemo(() => {
    const logged = new Set(streakDays.filter((row) => Number(row.total_seconds || 0) > 0).map((row) => String(row.date).slice(0, 10)));
    if (activeSession?.started_at?.slice(0, 10) === today) logged.add(today);
    let date = logged.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (logged.has(date)) { count += 1; date = addDays(date, -1); }
    return count;
  }, [activeSession, streakDays, today]);
  const todayStudySeconds = todayHours.reduce((total, row) => total + Number(row.seconds || 0), 0);
  const dailyTargetSeconds = dailyTargetHours * 3600;

  const loadDirectory = useCallback(async () => {
    const [subjectRows, totals] = await Promise.all([
      api('/subs'),
      api('/questions/by-sub'),
    ]);
    setSubs(subjectRows);
    setQuestionTotals(totals);
    setStartForm((current) => ({ ...current, sub_id: current.sub_id || String(subjectRows[0]?.id || '') }));
  }, []);

  const loadDateData = useCallback(async (date, sessionQuery) => {
    const [hourRows, sessionRows] = await Promise.all([
      api(`/daily/${date}/hourly`),
      api(`/sessions${sessionQuery || `?date=${date}`}`),
    ]);
    setHours(hourRows);
    setSessions(sessionRows);
  }, []);

  const loadTodayData = useCallback(async ({ updateSelection = true } = {}) => {
    const [hourRows, rows] = await Promise.all([api(`/daily/${today}/hourly`), api(`/sessions?date=${today}`)]);
    setTodayHours(hourRows);
    setTodaySessions(rows);
    if (updateSelection && selectedDate === today) {
      setHours(hourRows);
      setSessions(rows);
    }
  }, [selectedDate, today]);

  const loadTrends = useCallback(async () => {
    const from = addDays(mondayFor(today), -49);
    const monthStarts = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
      date.setUTCMonth(date.getUTCMonth() - (5 - index));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, date: utcDate(date) };
    });
    const [days, weeks, months] = await Promise.all([
      api(`/daily?from=${addDays(today, -364)}&to=${today}`),
      api(`/weekly?from=${from}&to=${today}`),
      Promise.all(monthStarts.map((item) => api(`/monthly?year=${item.year}&month=${item.month}`))),
    ]);
    setStreakDays(days);
    const weeklyMap = new Map(weeks.map((row) => [String(row.week_start).slice(0, 10), Number(row.total_seconds || 0)]));
    setWeeklyTrend(Array.from({ length: 8 }, (_, index) => {
      const weekStart = addDays(from, index * 7);
      return { label: weekStart, total_seconds: weeklyMap.get(weekStart) || 0 };
    }));
    setMonthlyTrend(months.map((row, index) => ({ ...row, label: monthStarts[index].date })));
  }, [today]);

  const loadActive = useCallback(async () => {
    setActiveSession(await api('/sessions/active'));
  }, []);

  const refresh = useCallback(async (date = selectedDate) => {
    setLoading(true);
    setError('');
    try {
      const health = await api('/health');
      setApiStatus(health.status === 'ok' ? 'online' : 'offline');
      const requests = [loadDirectory(), loadActive(), loadTrends()];
      const rangeArchive = view === 'sessions' && sessionFilter === 'range';
      if (date === today && !rangeArchive) requests.push(loadTodayData());
      else requests.push(
        loadDateData(date, rangeArchive ? `?from=${rangeFrom}&to=${rangeTo}` : undefined),
        loadTodayData({ updateSelection: false }),
      );
      await Promise.all(requests);
    } catch (err) {
      setApiStatus('offline');
      setError(err.message || 'Could not reach the API.');
    } finally {
      setLoading(false);
    }
  }, [loadActive, loadDateData, loadDirectory, loadTodayData, loadTrends, rangeFrom, rangeTo, selectedDate, sessionFilter, today, view]);

  useEffect(() => {
    if (initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
    refresh(today);
  }, [refresh, today]);

  useEffect(() => {
    if (pendingRolloverRefresh.current == null) return;
    const date = pendingRolloverRefresh.current;
    pendingRolloverRefresh.current = null;
    refresh(date).finally(() => { rolloverLock.current = false; });
  }, [refresh, today]);

  useEffect(() => {
    const checkUtcDate = () => {
      const nextToday = utcDate();
      if (nextToday === today || rolloverLock.current) return;
      rolloverLock.current = true;
      skipRolloverDateEffect.current = true;
      const nextSelectedDate = selectedDate === today ? nextToday : selectedDate;
      setToday(nextToday);
      setSelectedDate(nextSelectedDate);
      setRangeTo((current) => current === today ? nextToday : current);
      setRangeFrom((current) => current === addDays(today, -6) ? addDays(nextToday, -6) : current);
      pendingRolloverRefresh.current = nextSelectedDate;
    };
    const timer = setInterval(checkUtcDate, 30_000);
    window.addEventListener('focus', checkUtcDate);
    document.addEventListener('visibilitychange', checkUtcDate);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', checkUtcDate);
      document.removeEventListener('visibilitychange', checkUtcDate);
    };
  }, [refresh, selectedDate, today]);

  useEffect(() => {
    const storedTarget = Number(window.localStorage.getItem('gate-daily-target-hours'));
    if (Number.isFinite(storedTarget) && storedTarget > 0) setDailyTargetHours(storedTarget);
    setPausedSessionId(window.localStorage.getItem('gate-paused-session-id') || '');
    setPauseStateLoaded(true);
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('gate-theme') === 'dark' ? 'dark' : 'light';
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const toggleTheme = () => setTheme((current) => {
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('gate-theme', next);
    return next;
  });

  const setDailyTarget = (value) => {
    const target = Math.min(24, Math.max(1, Number(value) || 1));
    setDailyTargetHours(target);
    window.localStorage.setItem('gate-daily-target-hours', String(target));
  };

  useEffect(() => {
    if (skipRolloverDateEffect.current) {
      skipRolloverDateEffect.current = false;
      return;
    }
    if (selectedDate === today && loading) return;
    let ignore = false;
    setDateLoading(true);
    Promise.all([
      api(`/daily/${selectedDate}/hourly`),
      api(`/sessions?date=${selectedDate}`),
    ]).then(([hourRows, sessionRows]) => {
      if (ignore) return;
      setHours(hourRows); setSessions(sessionRows);
      if (selectedDate === today) setTodaySessions(sessionRows);
    }).catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setDateLoading(false); });
    return () => { ignore = true; };
  }, [selectedDate, today]);

  useEffect(() => {
    if (!activeSession?.started_at) { setElapsed(0); return undefined; }
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const loadSessionList = async (filter = sessionFilter) => {
    setBusy(true);
    setError('');
    try {
      const query = filter === 'range'
        ? `?from=${rangeFrom}&to=${rangeTo}`
        : `?date=${selectedDate}`;
      setSessions(await api(`/sessions${query}`));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const loadRange = async () => {
    setBusy(true);
    setError('');
    try {
      const params = `from=${rangeFrom}&to=${rangeTo}`;
      const [days, weeks] = await Promise.all([
        api(`/daily?${params}`),
        api(`/weekly?${params}`),
      ]);
      setDailyRange(days);
      setWeeklyRange(weeks);
      setSessionFilter('range');
      setSessions(await api(`/sessions?${params}`));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const loadSessionDetail = async (id) => {
    setBusy(true);
    setError('');
    try {
      const detail = await api(`/sessions/${id}`);
      setSelectedSession(detail);
      setSessionEdit({
        sub_id: String(detail.sub_id),
        study_type: detail.study_type,
        started_at: localInput(detail.started_at),
        stopped_at: localInput(detail.stopped_at),
        topics: detail.topics || '',
        note: detail.note || '',
      });
      setSatelliteEdit(initialSatelliteForm(detail));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const afterWrite = async (message, sessionId = selectedSession?.id) => {
    setNotice(message);
    const rangeArchive = view === 'sessions' && sessionFilter === 'range';
    const selectedDateLoad = selectedDate === today && !rangeArchive
      ? loadTodayData()
      : Promise.all([
        loadDateData(selectedDate, rangeArchive ? `?from=${rangeFrom}&to=${rangeTo}` : undefined),
        loadTodayData({ updateSelection: false }),
      ]);
    await Promise.all([loadActive(), loadDirectory(), selectedDateLoad, loadTrends()]);
    if (sessionId) await loadSessionDetail(sessionId);
    else setSelectedSession(null);
  };

  const startSession = async (event) => {
    event.preventDefault();
    if (mutationLock.current || activeSession) return;
    mutationLock.current = true;
    setBusy(true); setError('');
    try {
      const body = {
        sub_id: Number(startForm.sub_id),
        study_type: startForm.study_type,
        ...(startForm.started_at ? { started_at: timestampFromInput(startForm.started_at) } : {}),
        topics: startForm.topics || null,
        note: startForm.note || null,
      };
      const created = await api('/sessions', { method: 'POST', body: JSON.stringify(body) });
      setStartForm((current) => ({ ...current, started_at: '', topics: '', note: '' }));
      await afterWrite('Session started.', created.id);
      setView('sessions');
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const stopActive = async ({ pause = false } = {}) => {
    if (!activeSession || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true); setError('');
    try {
      await api(`/sessions/${activeSession.id}/stop`, { method: 'PATCH', body: JSON.stringify({}) });
      if (pause) {
        const id = String(activeSession.id);
        setPausedSessionId(id);
        window.localStorage.setItem('gate-paused-session-id', id);
      } else {
        setPausedSessionId('');
        window.localStorage.removeItem('gate-paused-session-id');
      }
      await afterWrite(pause ? 'Session paused.' : 'Session finished.', activeSession.id);
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const resumeSession = async () => {
    if (!selectedSession || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true); setError('');
    try {
      const elapsedSeconds = Number(selectedSession.duration_seconds || 0);
      const startedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();
      await api(`/sessions/${selectedSession.id}`, {
        method: 'PATCH', body: JSON.stringify({ started_at: startedAt, stopped_at: null }),
      });
      setPausedSessionId('');
      window.localStorage.removeItem('gate-paused-session-id');
      await afterWrite('Session resumed.', selectedSession.id);
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const saveSession = async (event) => {
    event.preventDefault();
    if (!selectedSession || !sessionEdit || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true); setError('');
    try {
      console.info('[GATE UI] saving session timestamps', JSON.stringify({
        sessionId: selectedSession.id,
        startedAt: sessionEdit.started_at,
        stoppedAt: sessionEdit.stopped_at,
      }));
      const updated = await api(`/sessions/${selectedSession.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sub_id: Number(sessionEdit.sub_id),
          study_type: sessionEdit.study_type,
          started_at: timestampFromInput(sessionEdit.started_at),
          stopped_at: timestampFromInput(sessionEdit.stopped_at),
          topics: sessionEdit.topics || null,
          note: sessionEdit.note || null,
        }),
      });
      await afterWrite('Session details saved.', updated.id);
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const saveSatellite = async (event) => {
    event.preventDefault();
    if (!selectedSession || !satelliteEdit || mutationLock.current) return;
    mutationLock.current = true;
    const type = selectedSession.study_type;
    const payload = {
      revision: {
        revision_number: satelliteEdit.revision_number === '' ? null : Number(satelliteEdit.revision_number),
        topics: satelliteEdit.topics || null,
        notes: satelliteEdit.notes || null,
      },
      lecture: { topic: satelliteEdit.topic || null, notes: satelliteEdit.notes || null },
      q_solve: {
        topic: satelliteEdit.topic || null,
        questions_attempted: Number(satelliteEdit.questions_attempted),
        questions_correct: Number(satelliteEdit.questions_correct),
        questions_wrong: Number(satelliteEdit.questions_wrong),
      },
      test: {
        test_name: satelliteEdit.test_name,
        questions_attempted: Number(satelliteEdit.questions_attempted),
        questions_correct: Number(satelliteEdit.questions_correct),
        score: satelliteEdit.score === '' ? null : Number(satelliteEdit.score),
        max_score: satelliteEdit.max_score === '' ? null : Number(satelliteEdit.max_score),
        notes: satelliteEdit.notes || null,
      },
      analysis: {
        analysis_type: satelliteEdit.analysis_type || null,
        findings: satelliteEdit.findings || null,
        action_items: satelliteEdit.action_items || null,
        notes: satelliteEdit.notes || null,
      },
    }[type];
    setBusy(true); setError('');
    try {
      const updated = await api(`/sessions/${selectedSession.id}/${type === 'q_solve' ? 'qsolve' : type}`, {
        method: 'PATCH', body: JSON.stringify(payload),
      });
      setSelectedSession(updated);
      setSatelliteEdit(initialSatelliteForm(updated));
      await Promise.all([loadDirectory(), loadDateData(selectedDate)]);
      setNotice(`${TYPE_LABEL[type]} details saved.`);
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const deleteSelected = async () => {
    if (!selectedSession || mutationLock.current || !window.confirm('Delete this session and reverse its aggregate totals?')) return;
    mutationLock.current = true;
    const id = selectedSession.id;
    setBusy(true); setError('');
    try {
      await api(`/sessions/${id}`, { method: 'DELETE' });
      if (pausedSessionId === String(id)) {
        setPausedSessionId('');
        window.localStorage.removeItem('gate-paused-session-id');
      }
      setSelectedSession(null); setSessionEdit(null); setSatelliteEdit(null);
      await afterWrite('Session deleted.', null);
    } catch (err) { setError(err.message); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  const selectDay = (date) => {
    setSelectedDate(date);
    setSessionFilter('day');
    setView('overview');
  };

  const clearSessionSelection = () => {
    setSelectedSession(null);
    setSessionEdit(null);
    setSatelliteEdit(null);
  };

  const chartMax = Math.max(1, ...dailyRange.map((row) => Number(row.total_seconds || 0)));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="GATE study ledger home"><span className="brand-mark">G</span><span>GATE<span className="brand-light">/27</span></span></a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setView('overview')}><span>⌂</span>Overview</button>
          <button className={view === 'sessions' ? 'nav-item active' : 'nav-item'} onClick={() => setView('sessions')}><span>◷</span>Study sessions</button>
          <button className={view === 'subjects' ? 'nav-item active' : 'nav-item'} onClick={() => setView('subjects')}><span>▤</span>Subjects & questions</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-label">CONNECTED API</div>
          <div className="connection"><span className={`connection-dot ${apiStatus}`} />{apiStatus === 'checking' ? 'Checking connection' : apiStatus === 'online' ? 'API connected' : 'API unavailable'}</div>
          <span className="api-address">{API_ROOT}</span>
        </div>
      </aside>

      <div className="main-column" id="top">
        <header className="topbar">
          <div className="breadcrumb">GATE 2027 <span>/</span> PERSONAL STUDY LEDGER</div>
          <div className="top-actions">
            <span className="today-label">{formatDate(today)}</span>
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? '☀' : '☾'}</button>
            <button className="icon-button" onClick={() => refresh(selectedDate)} disabled={loading} aria-label="Refresh data">↻</button>
            <div className="avatar">S</div>
          </div>
        </header>

        <div className="content-area">
          {error && <div className="alert error-alert"><span>!</span><div><strong>Request failed</strong><p>{error}</p></div><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {notice && <div className="alert success-alert"><span>✓</span><p>{notice}</p></div>}

          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> GATE 2027 PREPARATION</div>
              <h1>{view === 'overview' ? <>Make every<br /><em>study hour count.</em></> : view === 'sessions' ? <>Your study<br /><em>sessions.</em></> : <>Know your<br /><em>subjects.</em></>}</h1>
              <p className="page-intro">{view === 'overview' ? 'A clear view of your effort, one focused session at a time.' : view === 'sessions' ? 'Capture the work, review the details, and keep your study log honest.' : 'Track question practice by subject and keep your GATE syllabus in view.'}</p>
            </div>
            <div className="date-chip"><span className="date-icon">▦</span><div><small>VIEWING DAY</small><strong>{formatDate(selectedDate)}</strong></div></div>
          </section>

          {activeSession && (
            <section className="active-banner">
              <div className="pulse-mark"><span /></div>
              <div className="active-copy"><small>SESSION IN PROGRESS</small><strong>{selectedSubject.get(Number(activeSession.sub_id))?.name || `Subject #${activeSession.sub_id}`}</strong><span>{TYPE_LABEL[activeSession.study_type]} · Started {formatTime(activeSession.started_at)}</span></div>
              <div className="active-time">{formatClock(elapsed)}</div>
              <button className="button button-light" onClick={() => stopActive({ pause: true })} disabled={busy}>Pause <span>Ⅱ</span></button>
              <button className="button button-primary" onClick={() => stopActive()} disabled={busy}>Finish <span>■</span></button>
            </section>
          )}

          {view === 'overview' && (
            <>
              <section className="metrics-grid" aria-label="Today's study dashboard">
                <MetricCard label="TODAY'S STUDY" value={formatSeconds(todayStudySeconds)} detail={formatDate(today)} icon="◷" tint="green" />
                <MetricCard label="TODAY'S SESSIONS" value={todaySessions.length.toLocaleString()} detail="Saved for today" icon="▤" tint="blue" />
                <MetricCard label="QUESTIONS ATTEMPTED" value={questionSummary.attempted.toLocaleString()} detail="Across all subjects" icon="✓" tint="violet" />
                <MetricCard label="CORRECT" value={questionSummary.correct.toLocaleString()} detail="Question solving" icon="+" tint="green" />
                <MetricCard label="WRONG" value={questionSummary.wrong.toLocaleString()} detail="Question solving" icon="−" tint="amber" />
                <MetricCard label="CURRENT STREAK" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} detail="Consecutive study days" icon="✦" tint="blue" />
              </section>

              <section className="panel target-panel">
                <div><span className="panel-kicker">DAILY TARGET</span><h2>{formatSeconds(todayStudySeconds)} <span>of</span> {dailyTargetHours}h</h2><small>{todayStudySeconds >= dailyTargetSeconds ? 'Target reached. Keep your rhythm going.' : `${formatSeconds(Math.max(0, dailyTargetSeconds - todayStudySeconds))} remaining today`}</small></div>
                <div className="target-progress-wrap"><div className="target-progress"><i style={{ width: `${Math.min(100, todayStudySeconds / dailyTargetSeconds * 100)}%` }} /></div><label>Target (hours)<input aria-label="Daily target hours" type="number" min="1" max="24" value={dailyTargetHours} onChange={(event) => setDailyTarget(event.target.value)} /></label></div>
              </section>

              <div className="overview-grid">
                <section className="panel start-panel">
                  <PanelHeading kicker="START A SESSION" title="What are you working on?" badge="01" />
                  <form className="start-form" onSubmit={startSession}>
                    <label>Subject<select required value={startForm.sub_id} onChange={(event) => setStartForm({ ...startForm, sub_id: event.target.value })}>{subs.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
                    <label>Study type<select value={startForm.study_type} onChange={(event) => setStartForm({ ...startForm, study_type: event.target.value })}>{STUDY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="full-field">Focus or topic<input value={startForm.topics} onChange={(event) => setStartForm({ ...startForm, topics: event.target.value })} placeholder="e.g. Eigenvalues and eigenvectors" /></label>
                    <label className="full-field">Note <span className="optional">OPTIONAL</span><textarea rows="2" value={startForm.note} onChange={(event) => setStartForm({ ...startForm, note: event.target.value })} placeholder="A quick note for your future self" /></label>
                    <button className="button button-primary full-field" disabled={busy || loading || !pauseStateLoaded || !subs.length || Boolean(activeSession) || Boolean(pausedSessionId)}>{busy ? 'Saving…' : activeSession ? 'Finish the active session first' : pausedSessionId ? 'Resume your paused session first' : 'Start studying'} <span>→</span></button>
                  </form>
                  <p className="form-footnote">{pausedSessionId ? 'Your paused session is saved in Study sessions. Resume it before starting another.' : activeSession ? 'Finish or pause the active session before starting another.' : 'The timer starts now. Pause or finish the session when you are done.'}</p>
                </section>

                <section className="panel day-panel">
                  <PanelHeading kicker="DAY AT A GLANCE" title="Time by hour" badge="02" />
                  <div className="selected-date-row">
                    <button className="icon-button subtle" onClick={() => selectDay(addDays(selectedDate, -1))} aria-label="Previous day">←</button>
                    <label className="date-input-label"><span>{formatDate(selectedDate)}</span><input type="date" value={selectedDate} onChange={(event) => selectDay(event.target.value)} aria-label="Select day" /></label>
                    <button className="icon-button subtle" onClick={() => selectDay(addDays(selectedDate, 1))} aria-label="Next day">→</button>
                  </div>
                  <HourlyTimeline rows={hours} loading={dateLoading} />
                  <div className="hour-legend"><span><i className="legend-solid" /> Study time</span><span>{hours.length} subject / hour blocks</span></div>
                </section>
              </div>

              <div className="overview-grid lower-grid">
                <section className="panel week-panel">
                  <div className="panel-heading-row"><PanelHeading kicker="CALENDAR VIEW" title="Daily study trend" badge="03" /><button className="text-button" onClick={loadRange} disabled={busy}>{busy ? 'Loading…' : 'Refresh 7 days ↗'}</button></div>
                  <div className="range-controls"><label>From<input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} /></label><label>To<input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} /></label></div>
                  <div className="bar-chart" role="img" aria-label="Daily study time chart">
                    {(dailyRange.length ? dailyRange : []).map((row) => {
                      const height = row.total_seconds ? Math.max(5, Number(row.total_seconds) / chartMax * 100) : 3;
                      return <button key={String(row.date)} className={String(row.date).slice(0, 10) === selectedDate ? 'bar-column selected' : 'bar-column'} onClick={() => selectDay(String(row.date).slice(0, 10))} title={`${formatDate(String(row.date).slice(0, 10))}: ${formatSeconds(row.total_seconds)}`}><span className="bar-value">{row.total_seconds ? formatSeconds(row.total_seconds) : '—'}</span><span className="bar-track"><i style={{ height: `${height}%` }} /></span><small>{new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(row.date).slice(0, 10)}T12:00:00Z`))}</small></button>;
                    })}
                    {!dailyRange.length && <div className="chart-empty">Choose a range, then refresh to load daily totals.</div>}
                  </div>
                  {!!weeklyRange.length && <div className="week-range-list">{weeklyRange.map((row) => <div key={String(row.week_start)}><span>Week of {formatDate(String(row.week_start).slice(0, 10))}</span><strong>{formatSeconds(row.total_seconds)}</strong></div>)}</div>}
                </section>

                <section className="panel recent-panel">
                  <div className="panel-heading-row"><PanelHeading kicker="SESSION LOG" title={`${sessions.length} sessions`} badge="04" /><button className="text-button" onClick={() => { setView('sessions'); setSessionFilter('day'); loadSessionList('day'); }}>See all ↗</button></div>
                  <SessionList sessions={sessions} subjects={selectedSubject} onSelect={loadSessionDetail} selectedId={selectedSession?.id} loading={dateLoading} />
                </section>
              </div>

              <div className="overview-grid trend-grid">
                <section className="panel"><PanelHeading kicker="SUBJECT MIX" title="Study time by subject" badge="05" />
                  {subjectStudy.length ? <div className="subject-breakdown">{subjectStudy.map((row) => <div className="subject-breakdown-row" key={row.subId}><span>{row.name}</span><div><i style={{ width: `${Math.max(3, row.seconds / subjectStudy[0].seconds * 100)}%` }} /></div><strong>{formatSeconds(row.seconds)}</strong></div>)}</div> : <div className="mini-empty">No completed study time for this day yet.</div>}
                </section>
                <section className="panel"><PanelHeading kicker="WEEKLY TREND" title="Last 8 weeks" badge="06" />
                  {weeklyTrend.length ? <TrendChart rows={weeklyTrend} dateKey="label" /> : <div className="mini-empty">Weekly totals will appear here when loaded.</div>}
                </section>
                <section className="panel"><PanelHeading kicker="MONTHLY TREND" title="Last 6 months" badge="07" />
                  {monthlyTrend.length ? <TrendChart rows={monthlyTrend} dateKey="label" monthly /> : <div className="mini-empty">Monthly totals will appear here when loaded.</div>}
                </section>
              </div>

              <section className="panel activity-panel">
                <div className="panel-heading-row"><PanelHeading kicker="STUDY CONSISTENCY" title="Activity calendar" badge="08" /><span className="count-pill">LAST 365 DAYS</span></div>
                <ActivityCalendar rows={streakDays} today={today} onSelectDay={selectDay} />
              </section>
            </>
          )}

          {view === 'sessions' && (
            <div className="sessions-layout">
              <section className="panel session-list-panel">
                <div className="panel-heading-row"><PanelHeading kicker="SESSION ARCHIVE" title="Study log" badge="01" /><span className="count-pill">{filteredSessions.length} RECORDS</span></div>
                <div className="session-filters">
                  <div className="segmented"><button className={sessionFilter === 'day' ? 'selected' : ''} onClick={() => { setSessionFilter('day'); loadSessionList('day'); }}>Single day</button><button className={sessionFilter === 'range' ? 'selected' : ''} onClick={() => setSessionFilter('range')}>Date range</button></div>
                  {sessionFilter === 'day' ? <label className="filter-date">Day<input type="date" value={selectedDate} onChange={(event) => { setSessionFilter('day'); setSelectedDate(event.target.value); clearSessionSelection(); }} /></label> : <div className="range-controls"><label>From<input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} /></label><label>To<input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} /></label><button className="button button-small" onClick={() => { clearSessionSelection(); loadSessionList('range'); }} disabled={busy}>{busy ? 'Loading…' : 'Apply'}</button></div>}
                  <div className="form-row history-filters"><label>Subject<select aria-label="Filter by subject" value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); clearSessionSelection(); }}><option value="">All subjects</option>{subs.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Study type<select aria-label="Filter by study type" value={studyTypeFilter} onChange={(event) => { setStudyTypeFilter(event.target.value); clearSessionSelection(); }}><option value="">All study types</option>{STUDY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
                </div>
                <SessionList sessions={filteredSessions} subjects={selectedSubject} onSelect={loadSessionDetail} selectedId={selectedSession?.id} loading={busy} emptyText="No sessions match these filters." />
              </section>

              <section className="panel detail-panel">
                {selectedSession && sessionEdit ? (
                  <>
                    <div className="panel-heading-row"><PanelHeading kicker="SESSION DETAIL" title={`#${selectedSession.id}`} badge="02" /><button className="close-button" onClick={() => { setSelectedSession(null); setSessionEdit(null); }}>×</button></div>
                    <div className="detail-summary"><TypePill type={selectedSession.study_type} /><span>{selectedSession.duration_seconds === null ? 'Still running' : formatSeconds(selectedSession.duration_seconds)}</span><span>{formatDate(String(selectedSession.started_at).slice(0, 10))}</span></div>
                    {selectedSession.satellite && selectedSession.study_type === 'q_solve' && <div className="session-question-summary"><span>{Number(selectedSession.satellite.questions_attempted || 0)} attempted</span><span>{Number(selectedSession.satellite.questions_correct || 0)} correct</span><span>{Number(selectedSession.satellite.questions_wrong || 0)} wrong</span></div>}
                    <form className="edit-form" onSubmit={saveSession}>
                      <div className="form-row"><label>Subject<select value={sessionEdit.sub_id} onChange={(event) => setSessionEdit({ ...sessionEdit, sub_id: event.target.value })}>{subs.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Study type<select value={sessionEdit.study_type} onChange={(event) => setSessionEdit({ ...sessionEdit, study_type: event.target.value })}>{STUDY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
                      <div className="form-row"><label>Started at<input type="datetime-local" required value={sessionEdit.started_at} onInput={(event) => { const value = event.currentTarget.value; setSessionEdit((current) => ({ ...current, started_at: value })); }} /></label><label>Stopped at <span className="optional">BLANK = ACTIVE</span><input type="datetime-local" value={sessionEdit.stopped_at} onInput={(event) => { const value = event.currentTarget.value; setSessionEdit((current) => ({ ...current, stopped_at: value })); }} /></label></div>
                      <label>Topics<input value={sessionEdit.topics} onChange={(event) => setSessionEdit({ ...sessionEdit, topics: event.target.value })} /></label>
                      <label>Session note<textarea rows="2" value={sessionEdit.note} onChange={(event) => setSessionEdit({ ...sessionEdit, note: event.target.value })} /></label>
                      <button className="button button-primary" disabled={busy}>Save session changes <span>→</span></button>
                    </form>
                    <div className="detail-divider"><span>SESSION-SPECIFIC DETAILS</span></div>
                    {satelliteEdit && <SatelliteForm type={selectedSession.study_type} value={satelliteEdit} onChange={setSatelliteEdit} onSubmit={saveSatellite} busy={busy} />}
                    {selectedSession.stopped_at === null && <button className="button button-outline stop-detail" onClick={() => stopActive({ pause: true })} disabled={busy || activeSession?.id !== selectedSession.id}>Pause this session</button>}
                    {selectedSession.stopped_at !== null && pausedSessionId === String(selectedSession.id) && <button className="button button-primary stop-detail" onClick={resumeSession} disabled={busy || Boolean(activeSession)}>{busy ? 'Resuming…' : 'Resume paused session'}</button>}
                    <button className="delete-button" onClick={deleteSelected} disabled={busy}>Delete session and reverse its totals</button>
                  </>
                ) : <div className="detail-empty"><div className="empty-orbit">↗</div><h3>Select a session</h3><p>Choose a record from the log to view its full details, update its study data, or correct its timestamps.</p></div>}
              </section>
            </div>
          )}

          {view === 'subjects' && (
            <div className="subjects-layout">
              <section className="panel subjects-panel">
                <div className="panel-heading-row"><PanelHeading kicker="GATE SYLLABUS" title="Subject catalogue" badge="01" /><span className="count-pill">{subs.length} SUBJECTS</span></div>
                <div className="subject-grid">{subs.map((subject, index) => {
                  const totals = questionTotals.find((row) => Number(row.sub_id) === Number(subject.id));
                  return <article key={subject.id} className="subject-card"><span className="subject-number">{String(index + 1).padStart(2, '0')}</span><div className="subject-name"><h3>{subject.name}</h3><span>{subject.code}</span></div><div className="subject-questions"><strong>{Number(totals?.total_attempted || 0).toLocaleString()}</strong><small>ATTEMPTED</small></div><div className="subject-correct"><strong>{Number(totals?.total_correct || 0).toLocaleString()}</strong><small>CORRECT</small></div></article>;
                })}</div>
              </section>
              <section className="panel question-panel"><PanelHeading kicker="QUESTION PRACTICE" title="By subject" badge="02" /><div className="question-table-wrap"><table className="question-table"><thead><tr><th>SUBJECT</th><th>ATTEMPTED</th><th>CORRECT</th><th>WRONG</th><th>ACCURACY</th></tr></thead><tbody>{questionTotals.map((row) => { const attempted = Number(row.total_attempted || 0); const correct = Number(row.total_correct || 0); const wrong = Number(row.total_wrong || 0); return <tr key={row.sub_id}><td>{row.sub_name}</td><td>{attempted}</td><td className="good-number">{correct}</td><td className="muted-number">{wrong}</td><td>{attempted ? `${Math.round(correct / attempted * 100)}%` : '—'}</td></tr>; })}</tbody></table></div>
                <QuestionOutcomeChart rows={questionTotals} />
              </section>
            </div>
          )}

          <footer className="app-footer"><span>GATE 2027 · STUDY WITH INTENTION</span><span>ALL TIME DATA IS STORED IN UTC</span><button onClick={() => refresh(selectedDate)} disabled={loading}>SYNC DATA ↻</button></footer>
        </div>
      </div>

      {loading && <div className="loading-bar" aria-label="Loading data"><i /></div>}
    </main>
  );
}

function MetricCard({ label, value, detail, icon, tint }) {
  return <article className="metric-card"><div className={`metric-icon ${tint}`}>{icon}</div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PanelHeading({ kicker, title, badge }) {
  return <div className="panel-heading"><div><span className="panel-kicker">{kicker}</span><h2>{title}</h2></div><span className="panel-badge">{badge}</span></div>;
}

function TypePill({ type }) {
  return <span className="type-pill" style={{ '--type-color': TYPE_COLOR[type] || '#6f7d75' }}><i />{TYPE_LABEL[type] || type}</span>;
}

function SessionList({ sessions, subjects, onSelect, selectedId, loading = false, emptyText = 'Nothing logged for this day yet. Start a session to add one.' }) {
  if (loading && !sessions?.length) return <div className="list-empty" role="status"><span>◷</span><p>Loading sessions…</p></div>;
  if (!sessions?.length) return <div className="list-empty" aria-live="polite"><span>◷</span><p>{emptyText}</p></div>;
  return <div className="session-list" aria-busy={loading}>{loading && <span className="inline-loading" role="status">Updating sessions…</span>}{sessions.map((session, index) => <button key={session.id} disabled={loading} className={Number(selectedId) === Number(session.id) ? 'session-row selected' : 'session-row'} onClick={() => onSelect(session.id)}><span className="session-index">{String(index + 1).padStart(2, '0')}</span><span className="session-main"><strong>{subjects.get(Number(session.sub_id))?.name || `Subject #${session.sub_id}`}</strong><small>{formatTime(session.started_at)} – {formatTime(session.stopped_at)}</small></span><span className="session-row-end"><TypePill type={session.study_type} /><strong>{session.duration_seconds === null ? 'LIVE' : formatSeconds(session.duration_seconds)}</strong></span></button>)}</div>;
}

function TrendChart({ rows, dateKey, monthly = false }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.total_seconds || 0)));
  return <div className="trend-chart" role="img" aria-label={monthly ? 'Monthly study time trend' : 'Weekly study time trend'}>
    {rows.map((row) => {
      const date = String(row[dateKey]).slice(0, 10);
      const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`));
      const dayLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
      return <div className="trend-column" key={date} title={`${monthly ? monthLabel : `Week of ${dayLabel}`}: ${formatSeconds(row.total_seconds)}`}><strong>{row.total_seconds ? formatSeconds(row.total_seconds) : '—'}</strong><span><i style={{ height: `${row.total_seconds ? Math.max(4, Number(row.total_seconds) / max * 100) : 2}%` }} /></span><small>{monthly ? monthLabel : dayLabel}</small></div>;
    })}
  </div>;
}

function ActivityCalendar({ rows, today, onSelectDay }) {
  const rangeEnd = new Date(`${today}T00:00:00.000Z`);
  const rangeStart = new Date(rangeEnd);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 364);
  const gridStart = new Date(rangeStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const secondsByDate = new Map(rows.map((row) => [String(row.date).slice(0, 10), Number(row.total_seconds || 0)]));
  const weeks = [];
  for (let start = new Date(gridStart); start <= rangeEnd; start.setUTCDate(start.getUTCDate() + 7)) {
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + weekday);
      if (date < rangeStart || date > rangeEnd) return null;
      const key = utcDate(date);
      return { date: key, seconds: secondsByDate.get(key) || 0 };
    });
    const monthStart = days.find((day) => day?.date.endsWith('-01'));
    weeks.push({ days, monthLabel: monthStart ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${monthStart.date}T12:00:00.000Z`)) : '' });
  }
  const activeDays = [...secondsByDate.entries()].filter(([date, seconds]) => date >= utcDate(rangeStart) && date <= today && seconds > 0).length;
  const level = (seconds) => !seconds ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 7200 ? 3 : 4;

  return <div className="activity-calendar-wrap">
    <div className="activity-calendar-scroll">
      <div className="activity-calendar-layout" role="group" aria-label="Daily study activity for the last 365 days">
        <div className="activity-month-spacer" />
        <div className="activity-months">{weeks.map((week, index) => <span key={index}>{week.monthLabel}</span>)}</div>
        <div className="activity-weekdays" aria-hidden="true"><span>Sun</span><span /> <span>Tue</span><span /> <span>Thu</span><span /> <span>Sat</span></div>
        <div className="activity-weeks">{weeks.map((week, weekIndex) => <div className="activity-week" key={weekIndex}>{week.days.map((day, dayIndex) => day ? <button key={day.date} type="button" className={`activity-day level-${level(day.seconds)}`} title={`${formatDate(day.date)} · ${formatSeconds(day.seconds)} studied`} aria-label={`${formatDate(day.date)}, ${formatSeconds(day.seconds)} studied`} onClick={() => onSelectDay(day.date)} /> : <span className="activity-day activity-day-empty" key={`empty-${weekIndex}-${dayIndex}`} />)}</div>)}</div>
      </div>
    </div>
    <div className="activity-calendar-footer"><span>{activeDays} study days in the last year</span><div className="activity-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((value) => <i className={`activity-day level-${value}`} key={value} />)}<span>More</span></div></div>
  </div>;
}

function QuestionOutcomeChart({ rows }) {
  const attemptedRows = rows.filter((row) => Number(row.total_attempted || 0) > 0);
  if (!attemptedRows.length) return <div className="question-outcome-empty">Question outcomes will appear here after you log practice.</div>;
  return <div className="question-outcomes">
    <div className="question-outcome-heading"><strong>Question outcomes by subject</strong><span>Correct vs wrong</span></div>
    {attemptedRows.map((row) => {
      const attempted = Number(row.total_attempted || 0);
      const correct = Number(row.total_correct || 0);
      const wrong = Number(row.total_wrong || 0);
      const accuracy = attempted ? Math.round(correct / attempted * 100) : 0;
      return <div className="question-outcome-row" key={row.sub_id}>
        <div className="question-outcome-title"><span>{row.sub_name}</span><strong>{attempted.toLocaleString()} attempted</strong></div>
        <div className="question-outcome-track" role="img" aria-label={`${row.sub_name}: ${correct} correct, ${wrong} wrong`}><i className="outcome-correct" style={{ width: `${correct / attempted * 100}%` }} /><i className="outcome-wrong" style={{ width: `${wrong / attempted * 100}%` }} /></div>
        <div className="question-outcome-caption"><span>{correct} correct</span><span>{wrong} wrong</span><strong>{accuracy}% accuracy</strong></div>
      </div>;
    })}
    <div className="question-outcome-legend"><span><i className="outcome-correct" /> Correct</span><span><i className="outcome-wrong" /> Wrong</span></div>
  </div>;
}

function HourlyTimeline({ rows, loading = false }) {
  if (loading && !rows?.length) return <div className="hours-empty" role="status"><span>◷</span><strong>Loading study time…</strong></div>;
  if (!rows?.length) return <div className="hours-empty"><span>◷</span><strong>No time logged yet</strong><small>When you stop a session, its time will appear here.</small></div>;
  const byHour = new Map();
  for (const row of rows) {
    const group = byHour.get(row.hour) || [];
    group.push(row);
    byHour.set(row.hour, group);
  }
  const activeHours = [...byHour.keys()].sort((a, b) => a - b);
  return <div className="hour-list">{activeHours.map((hour) => <div className="hour-row" key={hour}><span className="hour-label">{String(hour).padStart(2, '0')}:00</span><div className="hour-stacks">{byHour.get(hour).map((row) => <div className="hour-block" key={`${row.hour}-${row.sub_id}-${row.study_type}`} style={{ '--type-color': TYPE_COLOR[row.study_type] }} title={`${row.sub_name} · ${TYPE_LABEL[row.study_type]} · ${formatSeconds(row.seconds)}`}><span>{row.sub_name}</span><strong>{formatSeconds(row.seconds)}</strong></div>)}</div></div>)}</div>;
}

function SatelliteForm({ type, value, onChange, onSubmit, busy }) {
  const field = (key, label, props = {}) => <label>{label}<input value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} {...props} /></label>;
  const area = (key, label) => <label>{label}<textarea rows="2" value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></label>;
  return <form className="satellite-form" onSubmit={onSubmit}>
    {type === 'revision' && <>{field('revision_number', 'Revision number', { type: 'number', min: 0 })}{area('topics', 'Topics covered')}{area('notes', 'Revision notes')}</>}
    {type === 'lecture' && <>{field('topic', 'Lecture topic')}{area('notes', 'Lecture notes')}</>}
    {type === 'q_solve' && <>{field('topic', 'Question topic')}<div className="form-row three-fields">{field('questions_attempted', 'Attempted', { type: 'number', min: 0 })}{field('questions_correct', 'Correct', { type: 'number', min: 0 })}{field('questions_wrong', 'Wrong', { type: 'number', min: 0 })}</div></>}
    {type === 'test' && <>{field('test_name', 'Test name', { required: true })}<div className="form-row three-fields">{field('questions_attempted', 'Attempted', { type: 'number', min: 0 })}{field('questions_correct', 'Correct', { type: 'number', min: 0 })}{field('score', 'Score', { type: 'number', min: 0 })}</div>{field('max_score', 'Maximum score', { type: 'number', min: 0 })}{area('notes', 'Test notes')}</>}
    {type === 'analysis' && <>{field('analysis_type', 'Analysis type')}{area('findings', 'Findings')}{area('action_items', 'Action items')}{area('notes', 'Notes')}</>}
    <button className="button button-secondary" disabled={busy}>Save {TYPE_LABEL[type]?.toLowerCase()} details <span>→</span></button>
  </form>;
}
