let storageKey = 'studentPulseClasses';
const legacyDemoClass = { id: 'demo', course: 'BSCS', year: '3rd Year', section: 'A', subjects: ['Data Structures', 'Web Development', 'Database Systems', 'Discrete Mathematics'], students: [{ name: 'Jordan Davis' }, { name: 'Maria Santos' }, { name: 'Ethan Reyes' }] };
const emptyClass = { id: 'empty', course: 'No class selected', year: '', section: '', subjects: [], students: [] };
let classes = JSON.parse(localStorage.getItem(storageKey) || '[]') || [];
let currentUser = null;
let authMode = 'signin';
let activeClass = classes[0] || emptyClass;
let selectedStudent = activeClass.students[0] || null;
let pendingSubjects = [];
let editingClassId = null;
let editingAssessment = null;
let editingStudent = null;

const $ = (selector) => document.querySelector(selector);
const assessmentRows = $('#assessmentRows');
const subjectFilter = $('#subjectFilter');
let periodFilter = $('#periodFilter');
let allAssessmentsMode = false;
let assessmentPanelAnchor = null;
let overviewChromeState = null;
let previousAssessmentBreadcrumb = '';
const searchInput = $('#searchInput');
const modalBackdrop = $('#modalBackdrop');
const studentModalBackdrop = $('#studentModalBackdrop');
const classModalBackdrop = $('#classModalBackdrop');
const recommendationsBackdrop = $('#recommendationsBackdrop');
const completionBackdrop = $('#completionBackdrop');
const toast = $('#toast');

function saveClasses() {
  localStorage.setItem(storageKey, JSON.stringify(classes));
  if (currentUser && window.studentPulseFirebase?.saveStudentPulseClasses) {
    window.studentPulseFirebase.saveStudentPulseClasses(currentUser.uid, classes).catch((error) => reportFirebaseError('save', error));
  }
}

function syncClassesToFirebase() {
  if (currentUser && window.studentPulseFirebase?.saveStudentPulseClasses) {
    window.studentPulseFirebase.saveStudentPulseClasses(currentUser.uid, classes).catch((error) => reportFirebaseError('save', error));
  }
}

function isUntouchedLegacyDemo(item) {
  const studentInitials = new Map([['Jordan Davis', 'JD'], ['Maria Santos', 'MS'], ['Ethan Reyes', 'ER']]);
  const students = item?.students || [];
  return item?.id === legacyDemoClass.id
    && item.course === legacyDemoClass.course
    && item.year === legacyDemoClass.year
    && item.section === legacyDemoClass.section
    && !item.teacher
    && JSON.stringify(item.subjects || []) === JSON.stringify(legacyDemoClass.subjects)
    && students.length === legacyDemoClass.students.length
    && new Set(students.map((student) => student.name)).size === legacyDemoClass.students.length
    && students.every((student) => studentInitials.has(student.name)
      && (!student.surname || student.surname === '')
      && (!student.middleName || student.middleName === '')
      && (student.displayName || student.name) === student.name
      && (!student.studentNumber || student.studentNumber === 'No middle name')
      && (student.gender || 'Male') === 'Male'
      && (student.initials || studentInitials.get(student.name)) === studentInitials.get(student.name)
      && !(student.assessments || []).length);
}

function reportFirebaseError(operation, error) {
  console.error(`Firebase ${operation} failed:`, error);
  const code = error?.code || 'unknown-error';
  showToast(`Firebase ${operation} failed (${code}). Data is only saved in this browser.`);
}

function getAuthErrorMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'An account with this email already exists. Sign in or use a different email.',
    'auth/invalid-credential': 'Incorrect email or password. Please try again.',
    'auth/wrong-password': 'Incorrect email or password. Please try again.',
    'auth/user-not-found': 'No account was found for this email. Create an account first.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Could not connect to the server. Check your internet connection and try again.',
    'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this Firebase project.',
    'auth/configuration-not-found': 'Authentication is not configured for this Firebase project. Check the project settings and enabled sign-in provider.'
  };
  return messages[error?.code] || 'Something went wrong. Please try again.';
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignIn = mode === 'signin';
  $('#authTitle').textContent = isSignIn ? 'Welcome back' : 'Create your account';
  $('#authDescription').textContent = isSignIn ? 'Sign in to open your classes and reports.' : 'Use the same account on each device to sync your data.';
  $('#authSubmit').textContent = isSignIn ? 'Sign in' : 'Create account';
  $('#authModeToggle').textContent = isSignIn ? 'Create an account' : 'Back to sign in';
  $('#authPassword').autocomplete = isSignIn ? 'current-password' : 'new-password';
  $('#authSignupFields').hidden = isSignIn;
  $('#authGivenName').required = !isSignIn;
  $('#authSurname').required = !isSignIn;
  $('#authMessage').textContent = '';
}

async function initializeAuthenticatedApp(user) {
  currentUser = user || null;
  if (!currentUser) {
    $('#appShell').hidden = true;
    $('#authView').hidden = false;
    return;
  }

  $('#authView').hidden = true;
  $('#appShell').hidden = true;
  $('#accountEmail').textContent = currentUser.email || '';
  storageKey = `studentPulseClasses:${currentUser.uid}`;
  let localClasses = localStorage.getItem(storageKey);
  const legacyLocalClasses = localStorage.getItem('studentPulseClasses');
  if (!localClasses && legacyLocalClasses) {
    localClasses = legacyLocalClasses;
    localStorage.setItem(storageKey, localClasses);
  }
  if (legacyLocalClasses) localStorage.removeItem('studentPulseClasses');
  classes = (JSON.parse(localClasses || '[]') || []).filter((item) => !isUntouchedLegacyDemo(item));

  try {
    const remoteClasses = await window.studentPulseFirebase.loadStudentPulseClasses(currentUser.uid);
    if (Array.isArray(remoteClasses)) {
      classes = remoteClasses.filter((item) => !isUntouchedLegacyDemo(item));
      if (classes.length !== remoteClasses.length) await window.studentPulseFirebase.saveStudentPulseClasses(currentUser.uid, classes);
    } else if (classes.length) await window.studentPulseFirebase.saveStudentPulseClasses(currentUser.uid, classes);
  } catch (error) {
    reportFirebaseError('load', error);
  }
  localStorage.setItem(storageKey, JSON.stringify(classes));
  activeClass = classes[0] || emptyClass;
  selectedStudent = activeClass.students[0] || null;
  refreshActiveClassViews();
  $('#appShell').hidden = false;
}

window.addEventListener('studentpulse:firebase-ready', () => {
  window.studentPulseFirebase.onAuthStateChanged(initializeAuthenticatedApp, (error) => {
    $('#authMessage').textContent = getAuthErrorMessage(error);
  });
});
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = $('#authSubmit');
  submitButton.disabled = true;
  $('#authMessage').textContent = '';
  try {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (authMode === 'signup') {
      const givenName = $('#authGivenName').value.trim();
      const surname = $('#authSurname').value.trim();
      if (!givenName || !surname) throw new Error('Enter the teacher’s given name and surname.');
      await window.studentPulseFirebase.createAccount(email, password, givenName, surname);
    } else await window.studentPulseFirebase.signIn(email, password);
  } catch (error) {
    $('#authMessage').textContent = getAuthErrorMessage(error);
  } finally {
    submitButton.disabled = false;
  }
});
$('#authForm').addEventListener('input', () => { $('#authMessage').textContent = ''; });
$('#authModeToggle').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
$('#signOutButton').addEventListener('click', async () => {
  if (!window.confirm('Are you sure you want to sign out?')) return;
  setMobileMenu(false);
  try { await window.studentPulseFirebase.signOut(); }
  catch (error) { showToast(getAuthErrorMessage(error)); }
});
function classLabel(item) { return item.id === 'empty' ? 'No class selected' : `${item.course} · ${item.year} · Section ${item.section}`; }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function initials(name) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function getStudentInitials(student) {
  const displayText = (student.displayName || student.name || '').trim();
  if (!displayText) return 'NA';
  if (displayText.includes(',')) {
    const [surnamePart, givenPart] = displayText.split(',').map((part) => part.trim());
    if (surnamePart && givenPart) return `${surnamePart.charAt(0)}${givenPart.split(/\s+/)[0].charAt(0)}`.toUpperCase();
  }
  const parts = displayText.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  return displayText.slice(0, 2).toUpperCase();
}
function getStudentDisplayName(student) { return String(student?.surname ? `${student.surname}, ${student.name}` : student?.displayName || student?.name || '').trim(); }
function titleCase(value) { return value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function normalizeSubject(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function getScorePercentage(assessment) {
  const score = Number(assessment?.score);
  const total = Number(assessment?.total);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, score / total * 100));
}
function getAssessmentKey(assessment) {
  return [
    String(assessment?.title || '').replace(/\s*[-:–—]?\s*\(?\s*out of\s+\d+(?:,\d{3})*(?:\.\d+)?\s*(?:points?|pts?|items?)?\s*\)?\s*$/i, ''),
    normalizeSubject(assessment?.subject),
    assessment?.type,
    normalizePeriod(assessment?.period)
  ].map((value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}
function getUniqueAssessmentEntries(assessments) {
  const unique = new Map();
  assessments.forEach((assessment, index) => {
    const key = getAssessmentKey(assessment);
    if (key !== '|||') unique.set(key, { assessment, index });
  });
  return [...unique.values()];
}
function getUniqueAssessments(assessments) {
  return getUniqueAssessmentEntries(assessments).map(({ assessment }) => assessment);
}
function getAssessmentAverage(assessments, expectedAssessments = assessments) {
  const recorded = new Map(getUniqueAssessments(assessments).map((assessment) => [getAssessmentKey(assessment), assessment]));
  const expected = getUniqueAssessments(expectedAssessments);
  if (!expected.length) return 0;
  return expected.reduce((sum, assessment) => sum + getScorePercentage(recorded.get(getAssessmentKey(assessment))), 0) / expected.length;
}
function getMissingAssessments(student, classAssessments) {
  const studentKeys = new Set(student.assessments.map(getAssessmentKey));
  return classAssessments.filter((assessment) => !studentKeys.has(getAssessmentKey(assessment)));
}
function getAssessmentsForSubject(subject) {
  const assessments = activeClass.students.flatMap((student) => student.assessments)
    .filter((assessment) => normalizeSubject(assessment.subject) === normalizeSubject(subject));
  return getUniqueAssessments(assessments);
}
function renderOverviewCompletion() {
  const filter = $('#completionSubjectFilter');
  const selectedSubject = filter?.value || 'all';
  const studentAssessments = selectedStudent?.assessments.filter((assessment) => selectedSubject === 'all' || normalizeSubject(assessment.subject) === normalizeSubject(selectedSubject)) || [];
  const completed = getUniqueAssessments(studentAssessments).length;
  const expected = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments))
    .filter((assessment) => selectedSubject === 'all' || normalizeSubject(assessment.subject) === normalizeSubject(selectedSubject));
  const missing = getOverviewMissingAssessments();
  $('#completionValue').textContent = completed;
  const studentName = selectedStudent?.displayName || selectedStudent?.name;
  $('#completionFootnote').textContent = missing.length
    ? `Total assessments: ${expected.length}`
    : studentName ? `${completed} recorded by ${studentName}` : 'Select a student to view assessment records.';
  const missingButton = $('#viewMissingAssessments');
  if (missingButton) {
    missingButton.textContent = missing.length ? `View missing assessments (${missing.length})` : 'No missing assessments';
    missingButton.disabled = !selectedStudent || !missing.length;
  }
}
function getOverviewMissingAssessments() {
  if (!selectedStudent) return [];
  const selectedSubject = $('#completionSubjectFilter')?.value || 'all';
  const assessments = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments))
    .filter((assessment) => selectedSubject === 'all' || normalizeSubject(assessment.subject) === normalizeSubject(selectedSubject));
  return getMissingAssessments(selectedStudent, assessments);
}
function openOverviewMissingAssessments() {
  if (!completionBackdrop) return;
  const missing = selectedStudent ? getOverviewMissingAssessments() : [];
  const missingTotal = $('#missingAssessmentTotal');
  if (missingTotal) {
    missingTotal.hidden = missing.length === 0;
    missingTotal.textContent = missing.length ? `Total missing assessments: ${missing.length}` : '';
  }
  if (!selectedStudent || !missing.length) return;
  const selectedSubject = $('#completionSubjectFilter')?.value || 'all';
  const subjectNames = [...activeClass.subjects];
  missing.forEach((item) => {
    if (!subjectNames.some((subject) => normalizeSubject(subject) === normalizeSubject(item.subject))) subjectNames.push(item.subject);
  });
  const groups = subjectNames.map((subject, index) => ({
    subject,
    index,
    assessments: missing.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject))
  })).filter((group) => group.assessments.length);
  const colors = ['#5ee6dc', '#82b8ff', '#f0b45b', '#dc91d6', '#91d48c'];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  $('#completionModalTitle').textContent = `${selectedStudent.displayName || selectedStudent.name} · Missing assessments`;
  $('#missingAssessmentList').innerHTML = groups.map((group) => `<section class="missing-subject-group" style="--subject-accent:${colors[group.index % colors.length]}"><div class="missing-subject-heading"><span class="missing-subject-swatch"></span><strong>${escapeHtml(group.subject)}</strong><span class="missing-subject-count">${group.assessments.length}</span></div>${group.assessments.map((assessment) => {
    const title = assessment.title ? formatAssessmentTitle(assessment.title) : `${getPeriodLabel(assessment.period)} Exam`;
    return `<div class="missing-subject-assessment"><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(titleCase(assessment.type || 'Assessment'))} · ${escapeHtml(getPeriodLabel(assessment.period))}</small></div></div>`;
  }).join('')}</section>`).join('');
  if (selectedSubject !== 'all') $('#completionModalTitle').textContent = `${selectedStudent.displayName || selectedStudent.name} · ${selectedSubject} missing`;
  completionBackdrop.hidden = false;
}
function configureOverviewMissingButton() {
  const footnote = $('#completionFootnote');
  if (!footnote || $('#viewMissingAssessments')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'viewMissingAssessments';
  button.className = 'completion-missing-button';
  button.addEventListener('click', openOverviewMissingAssessments);
  footnote.after(button);
}
function renderGradebookSubjectOptions() {
  const menu = $('#reportDownloadMenu');
  if (!menu) return;
  menu.innerHTML = activeClass.subjects.length
    ? activeClass.subjects.map((subject) => `<button type="button" data-download-subject="${encodeURIComponent(subject)}">${subject}</button>`).join('')
    : '<p>No subjects configured.</p>';
}
function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function excelColumnName(index) {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}
function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const crc32 = (bytes) => {
    let checksum = 0xffffffff;
    bytes.forEach((byte) => {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    });
    return (checksum ^ 0xffffffff) >>> 0;
  };
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralLength = 0;
  Object.entries(files).forEach(([filename, content]) => {
    const nameBytes = encoder.encode(filename);
    const dataBytes = encoder.encode(content);
    const checksum = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
    centralLength += centralHeader.length;
  });
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralLength, true);
  endView.setUint32(16, localOffset, true);
  const archive = new Uint8Array(localOffset + centralLength + endRecord.length);
  let offset = 0;
  [...localParts, ...centralParts, endRecord].forEach((part) => { archive.set(part, offset); offset += part.length; });
  return archive;
}
function getGradebookAssessmentLabel(assessment) {
  const type = titleCase(assessment.type || 'Assessment');
  if (type.toLowerCase() === 'exam') return 'Exam';
  const abbreviations = { quiz: 'Q', activity: 'A', project: 'P' };
  const typeLabel = abbreviations[type.toLowerCase()] || type;
  const title = formatAssessmentTitle(assessment.title);
  const titleWithoutType = title.replace(new RegExp(`^${type}(?=$|\\s|[-:])(?:[-:]\\s*|\\s+)?`, 'i'), '');
  return titleWithoutType ? `${typeLabel}-${titleWithoutType}` : typeLabel;
}
function createGradebookWorkbook(subject, assessments) {
  const palette = ['FF176B66', 'FF315D91', 'FF9A6226', 'FF82508A', 'FF3F754A'];
  const periods = [
    { key: 'prelim', label: 'PRELIM', style: 4 },
    { key: 'midterm', label: 'MIDTERM', style: 5 },
    { key: 'semifinal', label: 'SEMI FINALS', style: 6 },
    { key: 'final', label: 'FINALS', style: 7 }
  ];
  [...new Set(assessments.map((item) => normalizePeriod(item.period)).filter((period) => !periods.some((entry) => entry.key === period)))].forEach((key, index) => {
    periods.push({ key, label: getPeriodLabel(key).toUpperCase(), style: 4 + index % 4 });
  });
  const columns = [{ kind: 'student' }];
  periods.forEach((period, periodIndex) => {
    const start = columns.length;
    const periodAssessments = assessments.filter((item) => normalizePeriod(item.period) === period.key);
    periodAssessments.forEach((assessment) => columns.push({ kind: 'assessment', assessment, style: period.style }));
    const gradeColumn = columns.length;
    columns.push({ kind: 'period-grade', period, style: period.style });
    period.start = start;
    period.end = columns.length - 1;
    period.gradeColumn = gradeColumn;
    period.palette = palette[periodIndex % palette.length];
  });
  const overallColumn = columns.length;
  columns.push({ kind: 'overall-grade' });
  const lastColumn = columns.length - 1;
  const blankRow = () => Array(columns.length).fill(null);
  const makeCell = (value, style = 0) => ({ value, style });
  const rows = [];
  const titleRow = blankRow();
  titleRow[0] = makeCell('SUBJECT GRADE RECORD', 1);
  rows.push(titleRow);
  const subjectRow = blankRow();
  subjectRow[0] = makeCell('Subject', 2); subjectRow[1] = makeCell(subject, 3);
  const teacherName = currentUser?.displayName?.trim() || activeClass.teacher?.trim() || 'Not specified';
  subjectRow[3] = makeCell('Teacher', 2); subjectRow[4] = makeCell(teacherName, 3);
  rows.push(subjectRow);
  const courseRow = blankRow();
  courseRow[0] = makeCell('Course / Program', 2); courseRow[1] = makeCell(activeClass.course || 'Not specified', 3);
  courseRow[3] = makeCell('Year Level', 2); courseRow[4] = makeCell(activeClass.year || 'Not specified', 3);
  rows.push(courseRow);
  const sectionRow = blankRow();
  sectionRow[0] = makeCell('Section', 2); sectionRow[1] = makeCell(activeClass.section || 'Not specified', 3);
  rows.push(sectionRow);
  rows.push(blankRow());
  const groupRow = blankRow();
  groupRow[0] = makeCell('STUDENT NAME', 9);
  periods.forEach((period) => { groupRow[period.start] = makeCell(period.label, period.style); });
  groupRow[overallColumn] = makeCell('OVERALL GRADE (%)', 8);
  rows.push(groupRow);
  const assessmentRow = blankRow();
  const pointsRow = blankRow();
  assessmentRow[0] = makeCell('', 9);
  pointsRow[0] = makeCell('', 9);
  columns.forEach((column, index) => {
    if (column.kind === 'assessment') {
      assessmentRow[index] = makeCell(getGradebookAssessmentLabel(column.assessment), column.style);
      pointsRow[index] = makeCell(`Out of ${column.assessment.total} pts`, column.style);
    } else if (column.kind === 'period-grade') {
      assessmentRow[index] = makeCell('Period grade (%)', column.style);
      pointsRow[index] = makeCell('Average', column.style);
    }
  });
  rows.push(assessmentRow, pointsRow);
  sortStudentsAlphabetically(activeClass.students).forEach((student) => {
    const row = blankRow();
    row[0] = makeCell(student.displayName || student.name, 10);
    const studentAssessments = getUniqueAssessments(student.assessments.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)));
    columns.forEach((column, index) => {
      if (column.kind === 'assessment') {
        const score = studentAssessments.find((item) => getAssessmentKey(item) === getAssessmentKey(column.assessment));
        row[index] = makeCell(score ? Number(score.score) : 0, 11);
      } else if (column.kind === 'period-grade') {
        const expected = assessments.filter((item) => normalizePeriod(item.period) === column.period.key);
        const scores = studentAssessments.filter((item) => normalizePeriod(item.period) === column.period.key);
        row[index] = makeCell(getAssessmentAverage(scores, expected) / 100, 12);
      }
    });
    row[overallColumn] = makeCell(getAssessmentAverage(studentAssessments, assessments) / 100, 13);
    rows.push(row);
  });
  const cellXml = (cell, rowIndex, columnIndex) => {
    if (!cell) return '';
    const reference = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
    const style = ` s="${cell.style || 0}"`;
    if (cell.value === null || cell.value === undefined) return `<c r="${reference}"${style}/>`;
    if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${reference}"${style}><v>${cell.value}</v></c>`;
    return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
  };
  const rowXml = rows.map((row, rowIndex) => {
    const rowHeight = rowIndex === 0 ? ' ht="32" customHeight="1"' : rowIndex === 5 ? ' ht="26" customHeight="1"' : rowIndex === 6 ? ' ht="42" customHeight="1"' : rowIndex === 7 ? ' ht="22" customHeight="1"' : '';
    return `<row r="${rowIndex + 1}"${rowHeight}>${row.map((cell, columnIndex) => cellXml(cell, rowIndex, columnIndex)).join('')}</row>`;
  }).join('');
  const mergeReferences = [`A6:A8`, ...periods.filter((period) => period.end > period.start).map((period) => `${excelColumnName(period.start)}6:${excelColumnName(period.end)}6`), `${excelColumnName(overallColumn)}6:${excelColumnName(overallColumn)}8`, `A1:${excelColumnName(lastColumn)}1`];
  const columnXml = columns.map((column, index) => {
    const width = column.kind === 'student' ? 28 : column.kind === 'assessment' ? 19 : column.kind === 'overall-grade' ? 20 : 18;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${excelColumnName(lastColumn)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols>${columnXml}</cols><sheetData>${rowXml}</sheetData><mergeCells count="${mergeReferences.length}">${mergeReferences.map((reference) => `<mergeCell ref="${reference}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00%"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos"/><color rgb="FF24313A"/></font><font><b/><sz val="16"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FF42515C"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14242E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B66"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF315D91"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9A6226"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF82508A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3F754A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DEE3"/></left><right style="thin"><color rgb="FFD7DEE3"/></right><top style="thin"><color rgb="FFD7DEE3"/></top><bottom style="thin"><color rgb="FFD7DEE3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="8" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const readableStylesXml = stylesXml.replace(
    '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  );
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Subject Gradebook" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': readableStylesXml,
    'xl/worksheets/sheet1.xml': worksheetXml
  };
  return new Blob([buildStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function downloadSubjectRecord(subject) {
  if (!subject) return;
  const assessments = getAssessmentsForSubject(subject).sort((first, second) => {
    const periodOrder = ['prelim', 'midterm', 'semifinal', 'final'];
    const firstPeriod = periodOrder.indexOf(normalizePeriod(first.period));
    const secondPeriod = periodOrder.indexOf(normalizePeriod(second.period));
    return (firstPeriod < 0 ? periodOrder.length : firstPeriod) - (secondPeriod < 0 ? periodOrder.length : secondPeriod)
      || getAssessmentSortValue(first) - getAssessmentSortValue(second)
      || String(first.title || '').localeCompare(String(second.title || ''));
  });
  const blob = createGradebookWorkbook(subject, assessments);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${classLabel(activeClass)} - ${subject} - gradebook.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function configureReportGradebookDownload() {
  const button = $('#downloadSubjectRecord');
  const classPicker = $('.report-class-picker');
  if (!button || !classPicker || $('#reportDownloadMenu')) return;
  const actions = document.createElement('div');
  actions.className = 'report-header-actions';
  classPicker.parentElement.insertBefore(actions, classPicker);
  actions.appendChild(classPicker);
  const wrap = document.createElement('div');
  wrap.className = 'report-download-wrap';
  const menu = document.createElement('div');
  menu.className = 'report-download-menu';
  menu.id = 'reportDownloadMenu';
  menu.hidden = true;
  button.classList.remove('completion-download-button');
  button.classList.add('report-download-button');
  button.textContent = 'Download subject record';
  button.disabled = false;
  button.setAttribute('aria-expanded', 'false');
  actions.appendChild(wrap);
  wrap.append(button, menu);
  button.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-download-subject]');
    if (!option) return;
    downloadSubjectRecord(decodeURIComponent(option.dataset.downloadSubject));
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });
  renderGradebookSubjectOptions();
}
function formatCourse(value) { return value.trim().split(/\s+/).map((word) => word.length <= 5 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`).join(' '); }
function formatStudentName(value) { return value.trim().toLowerCase().split(/\s+/).map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' '); }
function formatSurname(value) { return value.trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function localDateValue() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function localTimeValue() { const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; }
function renderCurrentDate() { const dateLabel = $('#currentDateLabel'); if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(); }
function getStudentAverage(student) {
  const expected = getUniqueAssessments(activeClass.students.flatMap((item) => item.assessments));
  return getAssessmentAverage(student?.assessments || [], expected);
}
function sortStudentsAlphabetically(students) { return students.slice().sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '')); }
function sortStudentsForRoster(students, mode = 'average-desc') {
  const list = students.slice();
  switch (mode) {
    case 'average-asc':
      return list.sort((a, b) => getStudentAverage(a) - getStudentAverage(b));
    case 'name-asc':
      return list.sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''));
    case 'name-desc':
      return list.sort((a, b) => (b.displayName || b.name || '').localeCompare(a.displayName || a.name || ''));
    case 'average-desc':
    default:
      return list.sort((a, b) => getStudentAverage(b) - getStudentAverage(a));
  }
}
function getAssessmentSortValue(assessment) { const dateTime = assessment.dateTime || assessment.date || ''; const time = assessment.time || '00:00'; const candidate = dateTime.includes('T') ? dateTime : `${dateTime}T${time}`; const parsed = new Date(candidate); return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime(); }
function formatAssessmentTitle(value) { return titleCase(value || ''); }
function getAssessmentDisplayName(item) { const type = titleCase(item.type || 'Assessment'); const title = formatAssessmentTitle(item.title).replace(new RegExp(`^${type}(?=$|\\s|[-:])(?:[-:]\\s*|\\s+)?`, 'i'), ''); const period = getPeriodLabel(item.period || 'overall'); return title ? `${type} ${title}` : `${type} · ${period}`; }
const PERIOD_LABELS = { overall: 'Semester', prelim: 'Prelim', midterm: 'Midterm', semifinal: 'Semi Finals', final: 'Finals' };
function normalizePeriod(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[_\-\s]+/g, '');
  const aliases = {
    overall: 'overall', semester: 'overall', all: 'overall',
    prelim: 'prelim',
    midterm: 'midterm',
    semifinal: 'semifinal', semifinals: 'semifinal', 'semifinals': 'semifinal', 'semifinals': 'semifinal',
    final: 'final', finals: 'final'
  };
  return aliases[raw] || raw || 'overall';
}
function getPeriodLabel(value) { return PERIOD_LABELS[normalizePeriod(value)] || titleCase(String(value || 'Semester')); }
classes = classes.map((item) => ({ ...item, course: formatCourse(item.course), section: item.section.toUpperCase(), subjects: item.subjects.map((subject) => titleCase(subject)), students: item.students.map((student) => { const name = formatStudentName(student.name); const surname = formatSurname(student.surname || ''); const middleName = student.middleName ? formatStudentName(student.middleName) : (student.studentNumber ? formatStudentName(student.studentNumber) : ''); const gender = student.gender || 'Male'; const displayName = student.displayName || (surname ? `${surname}, ${name}` : name); return { ...student, name, surname, middleName, gender, displayName, studentNumber: student.studentNumber || middleName || 'No middle name', initials: student.initials || getStudentInitials({ ...student, displayName, name, surname }), assessments: student.assessments || [] }; }) }));
function renderClassOptions() {
  $('#classSelect').innerHTML = classes.length ? classes.map((item) => `<option value="${item.id}">${classLabel(item)}</option>`).join('') : '<option value="empty">No classes yet</option>';
  $('#classSelect').disabled = classes.length === 0;
  $('#classSelect').value = activeClass.id;
  $('#reportClassSelect').innerHTML = classes.length ? classes.map((item) => `<option value="${item.id}">${classLabel(item)}</option>`).join('') : '<option value="empty">No classes yet</option>';
  $('#reportClassSelect').disabled = classes.length === 0;
  $('#reportClassSelect').value = activeClass.id;
  renderClassCards();
}

function refreshActiveClassViews() {
  if (!activeClass) return;
  $('#activeClassBannerName').textContent = classLabel(activeClass);
  renderClassOptions();
  renderSubjects();
  renderStudentSelect();
  renderReports();
}

function classStudentsWithAverage(item) {
  const expected = getUniqueAssessments(item.students.flatMap((student) => student.assessments));
  return item.students.map((student) => {
    const average = getAssessmentAverage(student.assessments, expected);
    return { ...student, average };
  });
}

function renderReports() {
  arrangeClassReportPanels();
  renderGradebookSubjectOptions();
  const students = classStudentsWithAverage(activeClass);
  const allAssessments = activeClass.students.flatMap((student) => student.assessments);
  const uniqueAssessments = getUniqueAssessments(allAssessments);
  const classAverage = students.length ? students.reduce((sum, student) => sum + student.average, 0) / students.length : 0;
  const completed = uniqueAssessments.length;
  $('#reportClassName').textContent = classLabel(activeClass);
  $('#reportClassMeta').textContent = `${activeClass.subjects.length} subjects · ${activeClass.students.length} students · ${completed} assessments`;
  $('#reportMetrics').innerHTML = `<article class="report-metric"><span>Class average</span><strong>${classAverage.toFixed(1)}%</strong><small>Based on scores</small></article><article class="report-metric"><span>Total students</span><strong>${activeClass.students.length}</strong><small>Enrolled in this class</small></article><article class="report-metric"><span>Assessments</span><strong>${completed}</strong><small>Across all students</small></article><article class="report-metric"><span>Subjects</span><strong>${activeClass.subjects.length}</strong><small>Configured for this class</small></article>`;
  $('#reportSubjects').innerHTML = activeClass.subjects.map((subject) => { const expected = uniqueAssessments.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)); const average = Math.round(students.length ? students.reduce((sum, student) => sum + getAssessmentAverage(student.assessments.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)), expected), 0) / students.length : 0); return `<div class="report-subject-row"><div class="report-subject-label"><span>${subject}</span><strong>${average}%</strong></div><div class="report-progress"><span style="width:${average}%"></span></div></div>`; }).join('') || '<p class="muted">No subjects configured.</p>';
  $('#reportCompletion').innerHTML = students.map((student) => { const completedByStudent = getUniqueAssessments(student.assessments).length; const missing = getMissingAssessments(student, uniqueAssessments); const progress = completed ? Math.min(completedByStudent / completed * 100, 100) : 0; const studentKey = getStudentDisplayName(student).replace(/"/g, '&quot;'); return `<div class="report-completion-row"><div class="report-completion-label"><span>${getStudentDisplayName(student)}</span><strong>${completedByStudent}/${completed}</strong><button class="completion-help-button" type="button" data-completion-student="${studentKey}" aria-label="Show missing assessments" title="Show missing assessments">?</button></div><div class="report-progress"><span style="width:${progress}%"></span></div></div>`; }).join('') || '<p class="muted">No students added.</p>';
  const completionSubtitle = document.querySelector('.report-completion-panel .muted');
  if (completionSubtitle) completionSubtitle.textContent = 'Student assessment progress';
  $('#reportRanking').innerHTML = students.sort((a, b) => b.average - a.average).slice(0, 3).map((student, index) => `<div class="report-rank-card"><span class="rank-number">${index + 1}</span><span class="avatar card-avatar">${student.initials}</span><span class="report-rank-copy"><strong>${student.displayName || student.name}</strong><small>${getUniqueAssessments(student.assessments).length} assessments</small></span><strong class="report-rank-score">${student.average.toFixed(1)}%</strong></div>`).join('') || '<p class="muted">No students added.</p>';
  renderClassReportAnalytics();
}

function arrangeClassReportPanels() {
  const analytics = document.querySelector('.report-analytics');
  const reportGrid = document.querySelector('.reports-view .report-grid');
  const completion = document.querySelector('.report-completion-panel');
  if (!analytics || !reportGrid || !completion || completion.parentElement === analytics) return;
  analytics.appendChild(completion);
  reportGrid.remove();
}

function renderClassReportAnalytics() {
  const reportPeriodSelect = $('#reportSubjectPeriod');
  if (reportPeriodSelect && !reportPeriodSelect.value) reportPeriodSelect.value = 'overall';
  if (reportPeriodSelect) {
    const labels = { overall: 'Semester', prelim: 'Prelim', midterm: 'Midterm', semifinal: 'Semi Finals', final: 'Finals' };
    [...reportPeriodSelect.options].forEach((option) => { if (labels[option.value]) option.textContent = labels[option.value]; });
  }
  const trendPeriodSelect = $('#reportTrendPeriod');
  if (trendPeriodSelect && !trendPeriodSelect.value) trendPeriodSelect.value = 'overall';
  if (trendPeriodSelect) {
    const labels = { overall: 'Semester', prelim: 'Prelim', midterm: 'Midterm', semifinal: 'Semi Finals', final: 'Finals' };
    [...trendPeriodSelect.options].forEach((option) => { if (labels[option.value]) option.textContent = labels[option.value]; });
  }
  const trendPeriod = normalizePeriod(trendPeriodSelect?.value || 'overall');
  const subjectPeriod = normalizePeriod(reportPeriodSelect?.value || 'overall');
  const allAssessments = activeClass.students.flatMap((student) => student.assessments).filter((item) => {
    if (trendPeriod === 'overall') return true;
    return normalizePeriod(item.period) === trendPeriod;
  }).sort((a, b) => getAssessmentSortValue(a) - getAssessmentSortValue(b));
  const trendRange = $('#reportTrendRange')?.value || 'overall';
  const trendData = getTrendAssessments(allAssessments, trendRange);
  const trendLabel = $('#reportTrendLabel');
  if (trendLabel) trendLabel.textContent = `Whole class score over time · ${getPeriodLabel(trendPeriod)}`;
  drawTrendCanvas('#reportTrendChart', '#reportChartEmpty', trendData);
  const subjectLabel = $('#reportSubjectLabel');
  if (subjectLabel) subjectLabel.textContent = `Whole class average by subject · ${getPeriodLabel(subjectPeriod)}`;
  const subjectAssessments = activeClass.students.flatMap((student) => student.assessments).filter((item) => {
    if (subjectPeriod === 'overall') return true;
    return normalizePeriod(item.period) === subjectPeriod;
  });
  $('#reportSubjects').innerHTML = activeClass.subjects.map((subject) => {
    const normalizedSubject = normalizeSubject(subject);
    const scores = subjectAssessments.filter((item) => normalizeSubject(item.subject) === normalizedSubject).map(getScorePercentage);
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    return `<div class="report-subject-row"><div class="report-subject-label"><span>${subject}</span><strong>${average}%</strong></div><div class="report-progress"><span style="width:${average}%"></span></div></div>`;
  }).join('') || '<p class="muted">No subjects configured.</p>';
}

function drawTrendCanvas(canvasSelector, emptySelector, assessments) {
  const canvas = $(canvasSelector);
  const empty = $(emptySelector);
  if (!canvas) return;
  if (empty) empty.hidden = assessments.length > 0;
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!assessments.length) return;
  const padding = { top: 18, right: 18, bottom: 30, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (assessments.length === 1 ? chartWidth / 2 : index / (assessments.length - 1) * chartWidth);
  const y = (score) => padding.top + (100 - score) / 100 * chartHeight;
  context.font = '10px DM Sans';
  context.strokeStyle = '#27303b';
  context.fillStyle = '#8994a3';
  [0, 25, 50, 75, 100].forEach((value) => { const lineY = y(value); context.beginPath(); context.moveTo(padding.left, lineY); context.lineTo(width - padding.right, lineY); context.stroke(); context.fillText(`${value}%`, 4, lineY + 3); });
  drawSmoothTrend(context, assessments, x, y, height - padding.bottom);
  assessments.forEach((item, index) => { context.fillStyle = '#5ee6dc'; context.beginPath(); context.arc(x(index), y(item.score), 4, 0, Math.PI * 2); context.fill(); context.fillStyle = '#8994a3'; context.fillText(item.label.slice(0, 16), Math.max(padding.left, x(index) - 24), height - 9); });
}

function renderClassCards() {
  $('#classCards').innerHTML = classes.map((item) => `<article class="class-card"><div class="class-card-header"><div><h3>${item.course}</h3><span class="class-card-meta">${item.year} · Section ${item.section}</span></div><span class="class-badge">${item.students.length} ${item.students.length === 1 ? 'student' : 'students'}</span></div><div class="class-card-subjects">${item.subjects.map((subject) => `<span>${subject}</span>`).join('')}</div><div class="class-card-footer"><span>${item.subjects.length} ${item.subjects.length === 1 ? 'subject' : 'subjects'} configured</span><div class="class-card-actions"><button data-action="edit" data-id="${item.id}">Edit</button><button class="delete-class" data-action="delete" data-id="${item.id}">Delete</button></div></div></article>`).join('');
}

function renderSubjects() {
  const subjectOptions = activeClass.subjects.map((subject) => `<option value="${subject}">${subject}</option>`).join('');
  const assessmentSubject = $('#assessmentSubject');
  const previousAssessmentSubject = assessmentSubject.value;
  assessmentSubject.innerHTML = subjectOptions || '<option value="">Create a class subject first</option>';
  assessmentSubject.value = activeClass.subjects.includes(previousAssessmentSubject) ? previousAssessmentSubject : (activeClass.subjects[0] || '');
  subjectFilter.innerHTML = '<option value="all">All subjects</option>' + subjectOptions;
  const completionFilter = $('#completionSubjectFilter');
  const previousSubject = completionFilter.value;
  completionFilter.innerHTML = '<option value="all">All subjects</option>' + subjectOptions;
  completionFilter.value = activeClass.subjects.includes(previousSubject) ? previousSubject : 'all';
  renderOverviewCompletion();
  configureAssessmentPeriodFilter();
}

function configureAssessmentPeriodFilter() {
  if (periodFilter || !subjectFilter?.parentElement) return;
  const select = document.createElement('select');
  select.id = 'periodFilter';
  select.innerHTML = '<option value="all">All periods</option><option value="prelim">Prelim</option><option value="midterm">Midterm</option><option value="semifinal">Semi Finals</option><option value="final">Finals</option>';
  subjectFilter.parentElement.insertBefore(select, subjectFilter.nextSibling);
  periodFilter = select;
  select.addEventListener('change', filterAssessments);
}

function renderAssessmentStudentSelect(student = selectedStudent) {
  const studentSelect = $('#assessmentStudent');
  if (!studentSelect) return;
  studentSelect.innerHTML = sortStudentsAlphabetically(activeClass.students).map((item) => `<option value="${getStudentDisplayName(item)}">${getStudentDisplayName(item)}</option>`).join('');
  if (student && activeClass.students.some((item) => getStudentDisplayName(item) === getStudentDisplayName(student))) studentSelect.value = getStudentDisplayName(student);
  studentSelect.disabled = Boolean(editingAssessment);
}

function renderStudentSelect() {
  const hasClass = classes.length > 0;
  const isOverview = $('.nav-item[data-view="overview"]')?.classList.contains('active');
  document.querySelectorAll('#overviewView > *').forEach((section) => { section.hidden = hasClass ? section.id === 'noClassesPanel' : section.id !== 'noClassesPanel'; });
  document.querySelector('.active-class-banner').hidden = !hasClass || !isOverview;
  document.querySelector('.class-picker-strip').hidden = !hasClass || !isOverview;
  $('#studentStrip').hidden = !hasClass || !isOverview || activeClass.students.length === 0;
  $('#classEmptyPanel').hidden = !hasClass || activeClass.students.length > 0;
  $('#rosterPanel').hidden = !hasClass || activeClass.students.length === 0;
  $('#activeClassBannerMeta').textContent = `${activeClass.subjects.length} subjects · ${activeClass.students.length} students tracked`;
  $('#studentClassContext').textContent = `Adding to ${classLabel(activeClass)}`;
  $('#studentSelect').innerHTML = sortStudentsAlphabetically(activeClass.students).map((student) => `<option value="${getStudentDisplayName(student)}">${getStudentDisplayName(student)}</option>`).join('');
  if (selectedStudent && activeClass.students.some((student) => getStudentDisplayName(student) === getStudentDisplayName(selectedStudent))) $('#studentSelect').value = getStudentDisplayName(selectedStudent);
  else selectedStudent = activeClass.students[0] || null;
  renderSelectedStudent();
  renderTopStudents();
  renderStudentCards();
  renderSubjectPerformance();
  renderOverviewCompletion();
}

function renderSubjectPerformance() {
  const subjectColors = ['blue', 'violet', 'orange-dot', 'pink'];
  configureSubjectPeriod();
  const subjectPeriodSelect = $('#subjectPeriod');
  const selectedPeriod = normalizePeriod(subjectPeriodSelect?.value || 'overall');
  if (subjectPeriodSelect && !subjectPeriodSelect.value) subjectPeriodSelect.value = 'overall';
  const studentAssessments = selectedStudent ? selectedStudent.assessments.filter((item) => selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod) : [];
  const subjectLabel = $('#subjectPerformanceLabel');
  if (subjectLabel) subjectLabel.textContent = selectedStudent ? `${selectedStudent.displayName || selectedStudent.name}'s average by subject · ${selectedPeriod === 'overall' ? 'Semester' : getPeriodLabel(selectedPeriod)}` : 'Select a student to view subject performance';
  const rows = activeClass.subjects.map((subject, index) => {
    const normalizedSubject = normalizeSubject(subject);
    const classSubjectAssessments = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments).filter((item) => normalizeSubject(item.subject) === normalizedSubject && (selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod)));
    const results = getUniqueAssessments(studentAssessments.filter((item) => normalizeSubject(item.subject) === normalizedSubject));
    const average = Math.round(getAssessmentAverage(results, classSubjectAssessments));
    const color = subjectColors[index % subjectColors.length];
    const missing = selectedStudent ? getMissingAssessments(selectedStudent, classSubjectAssessments) : [];
    const recordedText = results.length ? `${results.length} assessment${results.length === 1 ? '' : 's'} recorded` : 'No assessment recorded yet';
    const missingText = missing.length ? ` <button class="subject-missing-button" type="button" data-missing-subject="${encodeURIComponent(subject)}" aria-label="Show missing assessments" title="Show missing assessments">?</button><strong class="subject-missing-count">${missing.length}</strong>` : '';
    return `<div class="subject-row"><div class="subject-title"><span class="subject-dot ${color}"></span><span>${subject}</span><strong>${average}%</strong></div><div class="bar-track"><span class="bar ${color}-bar" style="width:${average}%"></span></div><small class="subject-trend ${missing.length || average < 75 ? 'negative' : 'positive'}">${recordedText}${missingText}</small></div>`;
  }).join('');
  $('#subjectPerformanceList').innerHTML = rows || '<p class="muted">No subjects configured for this class.</p>';
  renderRecommendations();
}

function configureSubjectPeriod() {
  const heading = document.querySelector('.subject-panel .panel-heading');
  if (!heading || $('#subjectPeriod')) return;
  const select = document.createElement('select');
  select.id = 'subjectPeriod';
  select.hidden = true;
  select.value = 'overall';
  select.innerHTML = '<option value="overall">Semester</option><option value="prelim">Prelim</option><option value="midterm">Midterm</option><option value="semifinal">Semi Finals</option><option value="final">Finals</option>';
  heading.insertBefore(select, heading.querySelector('.more-button'));
  const menu = document.createElement('div');
  menu.id = 'subjectPeriodMenu';
  menu.className = 'subject-period-menu';
  menu.innerHTML = [...select.options].map((option) => `<button type="button" data-period="${option.value}">${option.textContent}</button>`).join('');
  heading.appendChild(menu);
  heading.querySelector('.more-button')?.addEventListener('click', () => menu.classList.toggle('open'));
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-period]');
    if (!button) return;
    const nextPeriod = button.dataset.period;
    select.value = nextPeriod;
    menu.classList.remove('open');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  select.addEventListener('change', () => {
    renderSubjectPerformance();
  });
}

function configureAnalyticsPeriod() {
  const trendSelect = $('#rangeSelect');
  const periodSelect = $('#analyticsPeriod') || (() => {
    const select = document.createElement('select');
    select.id = 'analyticsPeriod';
    select.innerHTML = '<option value="overall">Semester</option><option value="prelim">Prelim</option><option value="midterm">Midterm</option><option value="semifinal">Semi Finals</option><option value="final">Finals</option>';
    trendSelect?.parentElement.appendChild(select);
    return select;
  })();
  if (trendSelect && !trendSelect.dataset.configured) {
    trendSelect.innerHTML = '<option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="overall">Overall</option>';
    trendSelect.value = 'overall';
    trendSelect.dataset.configured = 'true';
    trendSelect.addEventListener('change', renderTrendChart);
  }
  if (periodSelect && !periodSelect.dataset.configured) {
    periodSelect.innerHTML = '<option value="overall">Semester</option><option value="prelim">Prelim</option><option value="midterm">Midterm</option><option value="semifinal">Semi Finals</option><option value="final">Finals</option>';
    periodSelect.value = 'overall';
    periodSelect.dataset.configured = 'true';
    periodSelect.addEventListener('change', () => { renderTrendChart(); renderSubjectPerformance(); renderAssessmentRows(); });
  }
}

function renderRecommendations() {
  const selectedPeriod = normalizePeriod($('#analyticsPeriod')?.value || 'overall');
  const scoredSubjects = activeClass.subjects.map((subject) => {
    const normalizedSubject = normalizeSubject(subject);
    const expected = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments).filter((item) => normalizeSubject(item.subject) === normalizedSubject && (selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod)));
    const scores = selectedStudent?.assessments.filter((item) => normalizeSubject(item.subject) === normalizedSubject && (selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod)) || [];
    return { subject, average: expected.length ? getAssessmentAverage(scores, expected) : null };
  });
  const needsAttention = scoredSubjects.filter((item) => item.average !== null && item.average < 75);
  $('#attentionCount').innerHTML = `${needsAttention.length}<span class="streak-label"> ${needsAttention.length === 1 ? 'subject' : 'subjects'}</span>`;
  $('#attentionSubjects').textContent = needsAttention.length ? needsAttention.map((item) => item.subject).join(' and ') : 'No subjects need attention';
  $('#recommendationsStudent').textContent = selectedStudent ? `For ${selectedStudent.displayName || selectedStudent.name}` : 'Select a student first';
  $('#recommendationList').innerHTML = needsAttention.length ? needsAttention.map((item) => `<div class="recommendation-item"><span class="recommendation-icon">!</span><div><strong>Review ${item.subject}</strong><p>Current average is ${Math.round(item.average)}%. Add a practice assessment or review the latest feedback.</p></div></div>`).join('') : `<div class="recommendation-item"><span class="recommendation-icon good">✓</span><div><strong>${selectedStudent ? 'No urgent recommendations' : 'Select a student first'}</strong><p>${selectedStudent ? 'Keep recording assessments to keep this progress current.' : 'Choose a student to see subject-specific recommendations.'}</p></div></div>`;
}

function renderStudentCards() {
  const sortMode = $('#rosterSort')?.value || 'average-desc';
  $('#studentCards').innerHTML = sortStudentsForRoster(activeClass.students, sortMode).map((student) => {
    const assessmentCount = getUniqueAssessments(student.assessments).length;
    const average = assessmentCount ? Math.round(getStudentAverage(student)) : 0;
    const selected = selectedStudent === student ? ' selected-card' : '';
    const middleNameText = student.middleName ? student.middleName : 'No middle name';
    const genderText = student.gender || 'Male';
    return `<button class="student-card${selected}" data-student="${getStudentDisplayName(student)}"><span class="avatar card-avatar">${student.initials}</span><span class="student-card-copy"><strong>${getStudentDisplayName(student)}</strong><small>${middleNameText} · ${genderText} · ${assessmentCount} assessment${assessmentCount === 1 ? '' : 's'}</small></span><strong class="card-average">${average}%</strong><span class="top-arrow">→</span></button>`;
  }).join('');
}

function renderTopStudents() {
  const filterSelect = $('#topStudentsType');
  if (filterSelect) {
    const currentValue = filterSelect.value || 'all';
    filterSelect.innerHTML = '<option value="all">All subjects</option>' + activeClass.subjects.map((subject) => `<option value="${subject}">${subject}</option>`).join('');
    if (activeClass.subjects.some((subject) => subject === currentValue) || currentValue === 'all') filterSelect.value = currentValue;
    else filterSelect.value = 'all';
    filterSelect.onchange = () => renderTopStudents();
  }

  const selectedSubject = filterSelect?.value || 'all';
  const expected = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments).filter((item) => selectedSubject === 'all' || normalizeSubject(item.subject) === normalizeSubject(selectedSubject)));
  const ranked = activeClass.students.map((student) => {
    const relevantAssessments = getUniqueAssessments(selectedSubject === 'all'
      ? student.assessments
      : student.assessments.filter((item) => normalizeSubject(item.subject) === normalizeSubject(selectedSubject)));
    const average = getAssessmentAverage(relevantAssessments, expected);
    return { ...student, average, assessmentCount: relevantAssessments.length };
  }).sort((a, b) => b.average - a.average).slice(0, 3);

  document.querySelectorAll('.top-student').forEach((card, index) => {
    const student = ranked[index];
    if (!student) { card.hidden = true; return; }
    card.hidden = false;
    const initialsValue = getStudentInitials(student);
    const studentKey = student.displayName || student.name;
    card.dataset.student = studentKey;
    card.setAttribute('data-student', studentKey);
    card.querySelector('.top-avatar').textContent = initialsValue;
    card.querySelector('.top-student-copy strong').textContent = studentKey;
    card.querySelector('.top-student-copy small').textContent = `${student.assessmentCount} ${selectedSubject === 'all' ? 'assessments completed' : `${selectedSubject} assessments`}`;
    card.querySelector('.top-score').textContent = `${student.average.toFixed(1)}%`;
    card.onclick = () => {
      const selectedName = card.dataset.student || card.getAttribute('data-student');
      if (!selectedName) return;
      const matchedStudent = activeClass.students.find((entry) => {
        const display = entry.displayName || entry.name;
        return entry.name === selectedName || display === selectedName || `${entry.surname || display.split(',')[0]}, ${entry.name}` === selectedName;
      });
      if (!matchedStudent) return;
      selectedStudent = matchedStudent;
      renderStudentSelect();
      renderSelectedStudent();
      renderSubjectPerformance();
      showToast(`${selectedStudent.name}'s profile loaded.`);
    };
  });

  const basisLabel = selectedSubject === 'all' ? 'all subjects' : selectedSubject;
  $('#topStudentsClassLabel').textContent = `${classLabel(activeClass)} · Based on ${basisLabel}`;
}

function renderSelectedStudent() {
  if (selectedStudent) {
    $('#studentSelect').value = getStudentDisplayName(selectedStudent);
    $('.avatar-large').textContent = selectedStudent.initials;
    $('.student-name').innerHTML = `${getStudentDisplayName(selectedStudent)} <span class="verified">✓</span>`;
    $('#selectedStudentMeta').textContent = classLabel(activeClass);
  }
  const assessmentCount = selectedStudent ? getUniqueAssessments(selectedStudent.assessments).length : 0;
  const average = assessmentCount ? Math.round(getStudentAverage(selectedStudent)) : null;
  $('#overallAverageValue').textContent = average === null ? '—' : String(average);
  $('#overallAverageUnit').hidden = average === null;
  $('#overallAverageProgress').style.width = `${average ?? 0}%`;
  $('#overallAverageFootnote').textContent = average === null
    ? selectedStudent ? 'No assessment scores recorded yet.' : 'Select a student to view an average.'
    : `${assessmentCount} recorded assessment${assessmentCount === 1 ? '' : 's'}`;
  renderAssessmentRows();
  renderTrendChart();
}

function getTrendBucket(dateValue, range) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  if (range === 'daily') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (range === 'monthly') return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (range === 'weekly') {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return 'Overall';
}

function getTrendAssessments(assessments, range) {
  if (range === 'overall') {
    return assessments.map((item, index) => ({ label: item.dateLabel || `Assessment ${index + 1}`, score: getScorePercentage(item) }));
  }
  const groups = new Map();
  assessments.forEach((item) => {
    const label = getTrendBucket(item.dateTime || `${item.date}T${item.time || '00:00'}`, range);
    const group = groups.get(label) || { label, scores: [] };
    group.scores.push(getScorePercentage(item));
    groups.set(label, group);
  });
  return [...groups.values()].map((group) => ({ label: group.label, score: group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length }));
}

function drawSmoothTrend(context, assessments, x, y, bottom) {
  if (!assessments.length) return;
  context.beginPath();
  context.lineJoin = 'round';
  context.lineCap = 'round';

  if (assessments.length === 1) {
    const firstX = x(0);
    const firstY = y(assessments[0].score);
    context.moveTo(firstX, bottom);
    context.lineTo(firstX, firstY);
  } else {
    context.moveTo(x(0), y(assessments[0].score));
    for (let index = 1; index < assessments.length; index += 1) {
      const previousX = x(index - 1);
      const currentX = x(index);
      const previousY = y(assessments[index - 1].score);
      const currentY = y(assessments[index].score);
      const midpointX = (previousX + currentX) / 2;
      const midpointY = (previousY + currentY) / 2;
      context.quadraticCurveTo(previousX, previousY, midpointX, midpointY);
      context.lineTo(currentX, currentY);
    }
  }

  context.strokeStyle = '#5ee6dc';
  context.lineWidth = 2.5;
  context.shadowColor = 'rgba(94,230,220,0.35)';
  context.shadowBlur = 10;
  context.stroke();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;

  if (assessments.length > 1) {
    const lastX = x(assessments.length - 1);
    const firstX = x(0);
    context.lineTo(lastX, bottom);
    context.lineTo(firstX, bottom);
    context.closePath();
    context.fillStyle = 'rgba(94,230,220,.12)';
    context.fill();
  }
}

function configureTrendRange() {
  const rangeSelect = $('#rangeSelect');
  if (!rangeSelect || rangeSelect.dataset.configured) return;
  rangeSelect.innerHTML = '<option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="overall" selected>Overall</option>';
  rangeSelect.dataset.configured = 'true';
  rangeSelect.addEventListener('change', renderTrendChart);
}

function renderTrendChart() {
  const canvas = $('#trendChart');
  const empty = $('#chartEmpty');
  const trendLabel = $('#trendLabel');
  if (!canvas) return;
  configureAnalyticsPeriod();
  const range = $('#rangeSelect')?.value || 'overall';
  const selectedPeriod = normalizePeriod($('#analyticsPeriod')?.value || 'overall');
  const rawAssessments = selectedStudent ? getUniqueAssessments(selectedStudent.assessments.filter((item) => selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod)).sort((a, b) => getAssessmentSortValue(a) - getAssessmentSortValue(b)) : [];
  const assessments = getTrendAssessments(rawAssessments, range);
  if (trendLabel) trendLabel.textContent = selectedStudent ? `${selectedStudent.displayName || selectedStudent.name}'s score over time · ${getPeriodLabel(selectedPeriod)}` : 'Select a student to view performance';
  if (empty) empty.hidden = assessments.length > 0;
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!assessments.length) return;
  const padding = { top: 18, right: 18, bottom: 30, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (assessments.length === 1 ? chartWidth / 2 : index / (assessments.length - 1) * chartWidth);
  const y = (score) => padding.top + (100 - score) / 100 * chartHeight;
  context.font = '10px DM Sans';
  context.strokeStyle = '#27303b';
  context.fillStyle = '#8994a3';
  context.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach((value) => { const lineY = y(value); context.beginPath(); context.moveTo(padding.left, lineY); context.lineTo(width - padding.right, lineY); context.stroke(); context.fillText(`${value}%`, 4, lineY + 3); });
  drawSmoothTrend(context, assessments, x, y, height - padding.bottom);
  assessments.forEach((assessment, index) => { const score = assessment.score; context.fillStyle = '#5ee6dc'; context.beginPath(); context.arc(x(index), y(score), 4, 0, Math.PI * 2); context.fill(); context.fillStyle = '#8994a3'; context.fillText(assessment.label.slice(0, 16), Math.max(padding.left, x(index) - 24), height - 9); });
}

function renderAssessmentRows() {
  const rows = selectedStudent ? getUniqueAssessmentEntries(selectedStudent.assessments).map(({ assessment, index }) => ({ ...assessment, student: getStudentDisplayName(selectedStudent), assessmentIndex: index })) : [];
  const assessmentStudentLabel = $('#assessmentStudentLabel');
  if (assessmentStudentLabel) assessmentStudentLabel.textContent = selectedStudent ? `Latest scores for ${selectedStudent.displayName || selectedStudent.name}` : 'Select a student to view assessments';
  configureAssessmentPeriodFilter();
  assessmentRows.innerHTML = rows.length ? rows.sort((a, b) => getAssessmentSortValue(b) - getAssessmentSortValue(a)).map((item) => { const percentage = getScorePercentage(item); return `<tr data-subject="${item.subject}" data-period="${normalizePeriod(item.period || 'unassigned')}" data-student="${item.student}" data-assessment-index="${item.assessmentIndex}"><td><div class="assessment-name"><span class="type-icon blue-bg">${(item.type || 'A')[0]}</span><div><strong>${getAssessmentDisplayName(item)}</strong><small>${item.student} · ${item.type || 'Assessment'} · ${item.period || 'Unassigned'}${item.reference ? ` · ${item.reference}` : ''}</small></div></div></td><td>${item.subject}</td><td>${item.dateLabel || 'No date'}</td><td><strong>${item.score} / ${item.total}</strong><small class="${percentage >= 85 ? 'score-good' : percentage >= 75 ? 'score-warn' : 'score-low'}">${Math.round(percentage)}%</small></td><td><span class="status completed">Completed</span></td><td><button class="edit-assessment" data-student="${item.student}" data-assessment-index="${item.assessmentIndex}">Edit</button></td></tr>`; }).join('') : '';
  const viewAllButton = document.querySelector('.view-all');
  if (viewAllButton) {
    viewAllButton.hidden = allAssessmentsMode;
    viewAllButton.disabled = !selectedStudent;
  }
  filterAssessments();
}

function filterAssessments() {
  const subject = subjectFilter.value.toLowerCase();
  const query = searchInput.value.toLowerCase();
  const period = periodFilter?.value.toLowerCase() || 'all';
  const dataRows = [...assessmentRows.querySelectorAll('tr[data-subject]')];
  const matches = dataRows.filter((row) => row.textContent.toLowerCase().includes(query) && (subject === 'all' || row.dataset.subject.toLowerCase() === subject) && (period === 'all' || normalizePeriod(row.dataset.period) === normalizePeriod(period)));
  const visibleRows = allAssessmentsMode ? matches : matches.slice(0, 5);
  const visibleSet = new Set(visibleRows);
  dataRows.forEach((row) => { row.hidden = !visibleSet.has(row); });
  assessmentRows.querySelectorAll('.period-empty, .assessment-preview-note').forEach((row) => row.remove());
  if (!matches.length) {
    const message = dataRows.length ? 'No assessments found for the selected filters.' : 'No assessments recorded for this student yet.';
    assessmentRows.insertAdjacentHTML('beforeend', `<tr class="period-empty"><td colspan="6" class="table-empty">${message}</td></tr>`);
  }
  else if (!allAssessmentsMode && matches.length > visibleRows.length) assessmentRows.insertAdjacentHTML('beforeend', `<tr class="assessment-preview-note"><td colspan="6">Showing ${visibleRows.length} of ${matches.length} matching assessments</td></tr>`);
}

function configureAssessmentFilterControls() {
  const actions = document.querySelector('.table-actions');
  const button = document.querySelector('.filter-button');
  if (!actions || !button || $('#assessmentFilterControls')) return;
  const controls = document.createElement('div');
  controls.id = 'assessmentFilterControls';
  controls.className = 'assessment-filter-controls';
  controls.hidden = true;
  actions.insertBefore(controls, actions.firstElementChild);
  actions.insertBefore(button, controls);
  [searchInput.closest('.search-field'), subjectFilter, periodFilter].filter(Boolean).forEach((control) => controls.appendChild(control));
  button.setAttribute('aria-controls', controls.id);
  button.setAttribute('aria-expanded', 'false');
}

function configureAllAssessmentsView() {
  const panel = document.querySelector('.assessments-panel');
  if (!panel || assessmentPanelAnchor) return;
  assessmentPanelAnchor = document.createComment('Recent assessments panel position');
  panel.before(assessmentPanelAnchor);
}

function openAllAssessmentsView() {
  if (!selectedStudent || !assessmentPanelAnchor || allAssessmentsMode) return;
  const panel = document.querySelector('.assessments-panel');
  const headerElements = [$('#pageHeading'), $('.active-class-banner'), $('.class-picker-strip'), $('#studentStrip'), $('#overviewView')].filter(Boolean);
  overviewChromeState = headerElements.map((element) => [element, element.hidden]);
  previousAssessmentBreadcrumb = $('.breadcrumbs strong').textContent;
  allAssessmentsMode = true;
  $('#allAssessmentsTitle').textContent = `${selectedStudent.displayName || selectedStudent.name} · Assessment record`;
  $('#allAssessmentsMeta').textContent = `${classLabel(activeClass)} · ${getUniqueAssessments(selectedStudent.assessments).length} assessments`;
  $('#allAssessmentsContent').appendChild(panel);
  overviewChromeState.forEach(([element]) => { element.hidden = true; });
  $('#allAssessmentsView').hidden = false;
  $('.breadcrumbs strong').textContent = 'Assessment record';
  subjectFilter.value = 'all';
  searchInput.value = '';
  if (periodFilter) periodFilter.value = 'all';
  renderAssessmentRows();
  window.scrollTo(0, 0);
}

function closeAllAssessmentsView() {
  if (!allAssessmentsMode || !assessmentPanelAnchor) return;
  const panel = document.querySelector('.assessments-panel');
  assessmentPanelAnchor.after(panel);
  $('#allAssessmentsView').hidden = true;
  allAssessmentsMode = false;
  overviewChromeState?.forEach(([element, wasHidden]) => { element.hidden = wasHidden; });
  overviewChromeState = null;
  $('.breadcrumbs strong').textContent = previousAssessmentBreadcrumb;
  renderAssessmentRows();
  window.scrollTo(0, 0);
}

function syncAssessmentTitleRequirement() { const type = $('#assessmentType'); const title = $('#assessmentTitle'); if (!type || !title) return; const isExam = type.value.toLowerCase() === 'exam'; title.required = !isExam; title.placeholder = isExam ? 'Optional for exams' : 'e.g. Quiz 1 or Capstone Project'; }
function validateAssessmentScore() { const score = $('#assessmentScore'); const total = $('#assessmentTotal'); const warning = $('#scoreWarning'); if (!score || !total || !warning) return true; const invalid = score.value !== '' && total.value !== '' && Number(score.value) > Number(total.value); warning.hidden = !invalid; score.setCustomValidity(invalid ? 'Score cannot be greater than Out of.' : ''); return !invalid; }
function openAssessmentModal() { editingAssessment = null; renderSubjects(); $('#assessmentModalTitle').textContent = 'Add assessment'; $('#saveAssessmentButton').textContent = 'Save assessment'; $('#deleteAssessmentButton').hidden = true; $('#assessmentForm').reset(); renderAssessmentStudentSelect(); $('#assessmentForm').elements.date.value = localDateValue(); $('#assessmentForm').elements.time.value = localTimeValue(); syncAssessmentTitleRequirement(); modalBackdrop.hidden = false; }
function openEditAssessment(studentName, assessmentIndex) { const student = activeClass.students.find((item) => getStudentDisplayName(item) === studentName); const assessment = student?.assessments[assessmentIndex]; if (!assessment) return; editingAssessment = { student, assessment }; renderSubjects(); renderAssessmentStudentSelect(student); $('#assessmentModalTitle').textContent = 'Edit assessment'; $('#saveAssessmentButton').textContent = 'Save changes'; $('#deleteAssessmentButton').hidden = false; $('#assessmentForm').elements.title.value = assessment.title || ''; $('#assessmentForm').elements.subject.value = assessment.subject || activeClass.subjects[0]; $('#assessmentForm').elements.type.value = assessment.type || 'Quiz'; $('#assessmentForm').elements.period.value = assessment.period || 'Prelim'; $('#assessmentForm').elements.score.value = assessment.score; $('#assessmentForm').elements.total.value = assessment.total; $('#assessmentForm').elements.date.value = assessment.date || localDateValue(); $('#assessmentForm').elements.time.value = assessment.time || localTimeValue(); syncAssessmentTitleRequirement(); validateAssessmentScore(); modalBackdrop.hidden = false; }
function closeAllModals() { modalBackdrop.hidden = true; studentModalBackdrop.hidden = true; classModalBackdrop.hidden = true; }

function arrangeOverviewSections() {
  const mainContent = $('.main-content');
  const topStudents = $('.top-students-panel');
  const studentStrip = $('#studentStrip');
  const roster = $('#rosterPanel');
  const overview = $('#overviewView');
  if (topStudents && overview) overview.insertBefore(topStudents, overview.firstElementChild);
  if (studentStrip && overview && topStudents) overview.insertBefore(studentStrip, topStudents.nextElementSibling);
  if (roster && overview) overview.appendChild(roster);
}

function setMobileMenu(open) {
  document.body.classList.toggle('mobile-menu-open', open);
  const toggle = $('#mobileMenuToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
}

$('#mobileMenuToggle').addEventListener('click', () => setMobileMenu(!document.body.classList.contains('mobile-menu-open')));
$('#mobileMenuOverlay').addEventListener('click', () => setMobileMenu(false));

document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => {
  if (allAssessmentsMode) closeAllAssessmentsView();
  document.querySelectorAll('.nav-item[data-view]').forEach((nav) => nav.classList.remove('active'));
  item.classList.add('active');
  const isOverview = item.dataset.view === 'overview';
  $('#overviewView').hidden = !isOverview;
  $('#pageHeading').hidden = !isOverview;
  $('#classManagerView').hidden = item.dataset.view !== 'class-maker';
  $('#reportsView').hidden = item.dataset.view !== 'reports';
  $('.active-class-banner').hidden = !isOverview;
  $('.class-picker-strip').hidden = !isOverview;
  $('#studentStrip').hidden = !isOverview || !activeClass.students.length;
  $('#emptyView').hidden = isOverview || item.dataset.view === 'reports';
  if (item.dataset.view === 'reports') renderReports();
  $('.breadcrumbs strong').textContent = item.dataset.label;
  setMobileMenu(false);
}));

$('#classSelect').addEventListener('change', (event) => { activeClass = classes.find((item) => item.id === event.target.value); selectedStudent = activeClass.students[0] || null; $('#activeClassBannerName').textContent = classLabel(activeClass); renderSubjects(); renderStudentSelect(); renderReports(); showToast(`${classLabel(activeClass)} selected.`); });
$('#reportClassSelect').addEventListener('change', (event) => { activeClass = classes.find((item) => item.id === event.target.value); selectedStudent = activeClass.students[0] || null; $('#classSelect').value = activeClass.id; $('#activeClassBannerName').textContent = classLabel(activeClass); renderSubjects(); renderStudentSelect(); renderReports(); showToast(`${classLabel(activeClass)} report loaded.`); });
$('#reportTrendRange').addEventListener('change', renderClassReportAnalytics);
$('#reportTrendPeriod').addEventListener('change', renderClassReportAnalytics);
$('#reportSubjectPeriod').addEventListener('change', renderClassReportAnalytics);
$('#reportSubjectMenu').addEventListener('click', () => {
  const select = $('#reportSubjectPeriod');
  let menu = $('#reportSubjectPeriodMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'reportSubjectPeriodMenu';
    menu.className = 'report-period-menu';
    menu.innerHTML = [...select.options].map((option) => `<button type="button" data-period="${option.value}">${option.textContent}</button>`).join('');
    select.parentElement.appendChild(menu);
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-period]');
      if (!button) return;
      select.value = button.dataset.period;
      menu.classList.remove('open');
      renderClassReportAnalytics();
    });
  }
  menu.classList.toggle('open');
});
$('#reportCompletion').addEventListener('click', (event) => {
  const button = event.target.closest('[data-completion-student]');
  if (!button || !completionBackdrop) return;
  const student = activeClass.students.find((item) => getStudentDisplayName(item) === button.dataset.completionStudent);
  if (!student) return;
  const allAssessments = getUniqueAssessments(activeClass.students.flatMap((item) => item.assessments));
  const missing = getMissingAssessments(student, allAssessments);
  $('#completionModalTitle').textContent = `${student.displayName || student.name}'s missing assessments`;
  $('#missingAssessmentList').innerHTML = missing.length ? missing.map((assessment) => { const type = titleCase(assessment.type || 'Assessment'); const title = assessment.title ? formatAssessmentTitle(assessment.title) : `${getPeriodLabel(assessment.period)} Exam`; return `<div class="missing-assessment-item"><div><div class="missing-assessment-heading"><span class="missing-assessment-type">${type}</span><strong>${title}</strong></div><small>${assessment.subject} · ${getPeriodLabel(assessment.period)}</small></div></div>`; }).join('') : '<p class="missing-assessment-empty">Complete. This student has all recorded assessments.</p>';
  completionBackdrop.hidden = false;
});
$('#closeCompletion').addEventListener('click', () => { completionBackdrop.hidden = true; });
$('#subjectPerformanceList').addEventListener('click', (event) => {
  const button = event.target.closest('.subject-missing-button');
  if (!button || !selectedStudent || !completionBackdrop) return;
  const subject = decodeURIComponent(button.dataset.missingSubject);
  const selectedPeriod = normalizePeriod($('#subjectPeriod')?.value || $('#analyticsPeriod')?.value || 'overall');
  const classAssessments = getUniqueAssessments(activeClass.students.flatMap((student) => student.assessments).filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject) && (selectedPeriod === 'overall' || normalizePeriod(item.period) === selectedPeriod)));
  const missing = getMissingAssessments(selectedStudent, classAssessments);
  $('#completionModalTitle').textContent = `${selectedStudent.displayName || selectedStudent.name} · ${subject}`;
  $('#missingAssessmentList').innerHTML = missing.map((assessment) => { const type = titleCase(assessment.type || 'Assessment'); const title = assessment.title ? formatAssessmentTitle(assessment.title) : `${getPeriodLabel(assessment.period)} Exam`; return `<div class="missing-assessment-item"><div><div class="missing-assessment-heading"><span class="missing-assessment-type">${type}</span><strong>${title}</strong></div><small>${assessment.subject} · ${getPeriodLabel(assessment.period)}</small></div></div>`; }).join('');
  completionBackdrop.hidden = false;
});
$('#studentSelect').addEventListener('change', (event) => { selectedStudent = activeClass.students.find((student) => getStudentDisplayName(student) === event.target.value); renderSelectedStudent(); renderSubjectPerformance(); renderOverviewCompletion(); showToast(`${selectedStudent.name}'s profile loaded.`); });
$('#assessmentStudent').addEventListener('change', (event) => { const student = activeClass.students.find((item) => getStudentDisplayName(item) === event.target.value); if (!student || editingAssessment) return; selectedStudent = student; renderSelectedStudent(); renderSubjectPerformance(); });
$('#assessmentType').addEventListener('change', syncAssessmentTitleRequirement);
$('#assessmentScore').addEventListener('input', validateAssessmentScore);
$('#assessmentTotal').addEventListener('input', validateAssessmentScore);
$('#openRecommendations').addEventListener('click', () => { renderRecommendations(); recommendationsBackdrop.hidden = false; });
$('#closeRecommendations').addEventListener('click', () => { recommendationsBackdrop.hidden = true; });
recommendationsBackdrop.addEventListener('click', (event) => { if (event.target === recommendationsBackdrop) recommendationsBackdrop.hidden = true; });
$('#assessmentBackButton').addEventListener('click', () => { $('#assessmentForm').reset(); editingAssessment = null; closeAllModals(); });
$('#deleteAssessmentButton').addEventListener('click', () => {
  if (!editingAssessment) return;
  const confirmed = window.confirm('Are you sure you want to delete this assessment?');
  if (!confirmed) return;
  const student = editingAssessment.student;
  const index = student.assessments.indexOf(editingAssessment.assessment);
  if (index >= 0) student.assessments.splice(index, 1);
  saveClasses();
  refreshActiveClassViews();
  $('#assessmentForm').reset();
  editingAssessment = null;
  closeAllModals();
  showToast('Assessment deleted successfully.');
});
$('#openAssessmentFromStrip').addEventListener('click', openAssessmentModal);
$('#studentBackButton').addEventListener('click', () => { $('#studentForm').reset(); editingStudent = null; closeAllModals(); });
function openStudentModal(student = null) {
  editingStudent = student;
  $('#studentModalTitle').textContent = student ? 'Edit student' : 'Add student';
  $('#saveStudentButton').textContent = student ? 'Save changes' : 'Add student';
  $('#deleteStudentButton').hidden = !student;
  $('#studentForm').elements.name.value = student?.name || '';
  $('#studentForm').elements.surname.value = student?.surname || '';
  $('#studentForm').elements.middleName.value = student?.middleName || '';
  $('#studentForm').elements.gender.value = student?.gender || 'Male';
  studentModalBackdrop.hidden = false;
}
$('#openStudentFromEmpty').addEventListener('click', () => openStudentModal());
$('#openStudentFromRoster').addEventListener('click', () => openStudentModal());
$('#editSelectedStudent').addEventListener('click', () => { if (selectedStudent) openStudentModal(selectedStudent); else showToast('Choose a student to edit first.'); });
$('#deleteStudentButton').addEventListener('click', () => {
  if (!editingStudent) return;
  if (!window.confirm(`Delete ${editingStudent.displayName || editingStudent.name}? This will also remove the student's assessments.`)) return;
  activeClass.students = activeClass.students.filter((student) => student !== editingStudent);
  selectedStudent = activeClass.students[0] || null;
  saveClasses();
  editingStudent = null;
  closeAllModals();
  refreshActiveClassViews();
  showToast('Student deleted successfully.');
});
function openClassForm(classToEdit = null) {
  editingClassId = classToEdit ? classToEdit.id : null;
  pendingSubjects = classToEdit ? [...classToEdit.subjects] : [];
  $('#classModalTitle').textContent = classToEdit ? 'Edit class' : 'Create class';
  $('#saveClassButton').textContent = classToEdit ? 'Save changes' : 'Save class';
  $('#classForm').elements.course.value = classToEdit?.course || '';
  $('#classForm').elements.year.value = classToEdit?.year || '3rd Year';
  $('#classForm').elements.section.value = classToEdit?.section || '';
  $('#classForm').elements.teacher.value = classToEdit?.teacher || '';
  $('#subjectChips').innerHTML = pendingSubjects.map((subject) => `<span class="subject-chip">${subject}<button type="button" data-subject="${subject}">×</button></span>`).join('');
  classModalBackdrop.hidden = false;
}
$('#openFirstClass').addEventListener('click', () => openClassForm());
function configureClassTeacherField() {
  const subjectsLabel = $('#subjectChips')?.closest('label');
  if (!subjectsLabel || $('#classForm').elements.teacher) return;
  const teacherLabel = document.createElement('label');
  teacherLabel.innerHTML = 'Teacher<input name="teacher" placeholder="e.g. Maria Santos" />';
  subjectsLabel.before(teacherLabel);
}
$('#openClassMakerFromManager').addEventListener('click', () => openClassForm());
document.querySelectorAll('.close-button').forEach((button) => button.addEventListener('click', closeAllModals));
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeAllModals(); }));
subjectFilter.addEventListener('change', filterAssessments);
$('#completionSubjectFilter').addEventListener('change', renderOverviewCompletion);
searchInput.addEventListener('input', filterAssessments);
document.querySelector('.filter-button')?.addEventListener('click', (event) => {
  const button = event.currentTarget;
  const controls = $('#assessmentFilterControls');
  if (!controls) return;
  controls.hidden = !controls.hidden;
  button.setAttribute('aria-expanded', String(!controls.hidden));
  button.textContent = controls.hidden ? '☷ Filter' : '☷ Hide filters';
});
document.querySelector('.view-all')?.addEventListener('click', openAllAssessmentsView);
$('#backToOverview').addEventListener('click', closeAllAssessmentsView);

$('#addSubject').addEventListener('click', () => { const input = $('#subjectInput'); const subject = input.value.trim(); if (!subject || pendingSubjects.includes(subject)) return; pendingSubjects.push(subject); $('#subjectChips').innerHTML = pendingSubjects.map((item) => `<span class="subject-chip">${item}<button type="button" data-subject="${item}">×</button></span>`).join(''); input.value = ''; });
$('#subjectChips').addEventListener('click', (event) => { if (event.target.matches('button')) { pendingSubjects = pendingSubjects.filter((item) => item !== event.target.dataset.subject); event.target.parentElement.remove(); } });
$('#rosterSort')?.addEventListener('change', () => renderStudentCards());
$('#studentCards').addEventListener('click', (event) => { const card = event.target.closest('.student-card'); if (!card) return; selectedStudent = activeClass.students.find((student) => getStudentDisplayName(student) === card.dataset.student); renderStudentSelect(); renderSubjectPerformance(); showToast(`${selectedStudent.name}'s profile loaded.`); });
assessmentRows.addEventListener('click', (event) => { const button = event.target.closest('.edit-assessment'); if (!button) return; openEditAssessment(button.dataset.student, Number(button.dataset.assessmentIndex)); });

$('#classCards').addEventListener('click', (event) => { const action = event.target.dataset.action; const id = event.target.dataset.id; if (!action) return; const item = classes.find((entry) => entry.id === id); if (action === 'edit') openClassForm(item); if (action === 'delete' && confirm(`Delete ${classLabel(item)}?`)) { classes = classes.filter((entry) => entry.id !== id); activeClass = classes[0] || { id: 'empty', course: 'No class', year: '', section: '', subjects: [], students: [] }; selectedStudent = activeClass.students[0] || null; saveClasses(); refreshActiveClassViews(); showToast('Class deleted.'); } });

$('#classForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingSubjects.length) return showToast('Add at least one subject first.');
  const form = new FormData(event.target);
  const course = formatCourse(form.get('course'));
  const year = form.get('year');
  const section = form.get('section').trim().toUpperCase();
  const teacher = String(form.get('teacher') || '').trim();
  const subjects = pendingSubjects.map((subject) => titleCase(subject));
  if (editingClassId) {
    const item = classes.find((entry) => entry.id === editingClassId);
    item.course = course;
    item.year = year;
    item.section = section;
    item.teacher = teacher;
    item.subjects = subjects;
    activeClass = item;
    showToast('Class updated successfully.');
  } else {
    const newClass = { id: `class-${Date.now()}`, course, year, section, teacher, subjects, students: [] };
    classes.push(newClass);
    activeClass = newClass;
    selectedStudent = null;
    showToast('Class created successfully.');
  }
  saveClasses();
  refreshActiveClassViews();
  event.target.reset();
  closeAllModals();
});

$('#studentForm').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.target); const name = formatStudentName(form.get('name')); const surname = formatSurname(form.get('surname')); const middleName = form.get('middleName') ? formatStudentName(form.get('middleName')) : ''; const gender = form.get('gender') || 'Male'; const displayName = `${surname}, ${name}`; if (editingStudent) { editingStudent.name = name; editingStudent.surname = surname; editingStudent.middleName = middleName; editingStudent.gender = gender; editingStudent.displayName = displayName; editingStudent.initials = initials(surname || name); selectedStudent = editingStudent; showToast('Student updated successfully.'); } else { const student = { name, surname, middleName, gender, displayName, initials: initials(surname || name), assessments: [] }; activeClass.students.push(student); selectedStudent = student; showToast('Student added successfully.'); } saveClasses(); refreshActiveClassViews(); if (editingStudent) { event.target.reset(); editingStudent = null; closeAllModals(); return; }
  event.target.reset(); $('#studentForm').elements.gender.value = 'Male'; $('#studentForm').elements.name.focus(); });

$('#assessmentForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateAssessmentScore()) { showToast('Score cannot be greater than Out of.'); return; }
  const form = new FormData(event.target);
  const studentDisplayName = form.get('student') || $('#assessmentStudent')?.value;
  const targetStudent = editingAssessment?.student || activeClass.students.find((student) => getStudentDisplayName(student) === studentDisplayName);
  if (!targetStudent) return showToast('Choose a student before recording an assessment.');

  const total = Number(form.get('total'));
  const score = Number(form.get('score'));
  const dateValue = form.get('date');
  const timeValue = form.get('time') || localTimeValue();
  const date = new Date(`${dateValue}T${timeValue}`);
  const updatedAssessment = {
    title: formatAssessmentTitle(form.get('title')),
    subject: titleCase(form.get('subject')),
    type: titleCase(form.get('type')),
    period: form.get('period'),
    score,
    total,
    date: dateValue,
    time: timeValue,
    dateTime: `${dateValue}T${timeValue}`,
    dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  };
  const duplicate = getUniqueAssessmentEntries(targetStudent.assessments)
    .map(({ assessment }) => assessment)
    .find((assessment) => assessment !== editingAssessment?.assessment && getAssessmentKey(assessment) === getAssessmentKey(updatedAssessment));
  if (duplicate && editingAssessment) {
    showToast('Another assessment with the same title, subject, type, and period already exists.');
    return;
  }
  if (duplicate) {
    const assessmentTitle = getAssessmentDisplayName(updatedAssessment);
    const shouldUpdate = window.confirm(`${assessmentTitle} for ${updatedAssessment.subject} · ${getPeriodLabel(updatedAssessment.period)} is already recorded for ${targetStudent.displayName || targetStudent.name} (${duplicate.score} / ${duplicate.total}). Update that record to ${score} / ${total}?`);
    if (!shouldUpdate) return;
    Object.assign(duplicate, updatedAssessment);
    selectedStudent = targetStudent;
    showToast('Existing assessment updated. Total count unchanged.');
  } else if (editingAssessment) {
    Object.assign(editingAssessment.assessment, updatedAssessment);
    selectedStudent = editingAssessment.student;
    showToast('Assessment updated successfully.');
  } else {
    targetStudent.assessments.push(updatedAssessment);
    selectedStudent = targetStudent;
    showToast('Assessment added successfully.');
  }

  saveClasses();
  refreshActiveClassViews();
  if (editingAssessment || duplicate) {
    event.target.reset();
    editingAssessment = null;
    closeAllModals();
    return;
  }
  $('#assessmentScore').value = '';
  validateAssessmentScore();
  showToast('Assessment added. Enter the next score when ready.');
});

configureClassTeacherField();
configureReportGradebookDownload();
configureOverviewMissingButton();
renderClassOptions();
renderCurrentDate();
$('#activeClassBannerName').textContent = classLabel(activeClass);
renderSubjects();
renderStudentSelect();
configureAssessmentFilterControls();
configureAllAssessmentsView();
renderReports();
$('#classManagerView').hidden = true;
arrangeOverviewSections();
