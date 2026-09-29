import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js';
import { getFirestore, doc, setDoc, collection, getDocs, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD4WIopXknWxBaZy9_yKvB0Z96RCXcpT8U',
  authDomain: 'performance-4d972.firebaseapp.com',
  projectId: 'performance-4d972',
  storageBucket: 'performance-4d972.firebasestorage.app',
  messagingSenderId: '691285473385',
  appId: '1:691285473385:web:2da851b8dc9bb86df2caf8',
  measurementId: 'G-LE4XX9Q910'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
async function createAccount(email, password, givenName, surname) {
  await setPersistence(auth, browserLocalPersistence);
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: `${givenName} ${surname}`.trim() });
  return credential;
}
async function signIn(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (error) {
  console.info('Firebase Analytics will activate when served from a web origin.');
}
async function saveStudentPulseClasses(userId, classes) {
  const classCollection = collection(db, 'users', userId, 'studentPulseClasses');
  const existingClasses = await getDocs(classCollection);
  const classIds = new Set(classes.map((classItem) => String(classItem.id)));
  await Promise.all(existingClasses.docs.filter((snapshot) => !classIds.has(snapshot.id)).map((snapshot) => deleteClassDocument(snapshot.ref)));
  await Promise.all(classes.map(async (classItem) => {
    const students = classItem.students || [];
    const classRef = doc(classCollection, String(classItem.id));
    const studentCollection = collection(classRef, 'students');
    const existingStudents = await getDocs(studentCollection);
    const currentStudentIds = new Set(students.map((student, index) => getStudentDocumentId(student, index)));
    await Promise.all(existingStudents.docs.filter((snapshot) => !currentStudentIds.has(snapshot.id)).map((snapshot) => deleteStudentDocument(snapshot.ref)));
    await setDoc(classRef, {
      id: classItem.id,
      recordType: 'class',
      course: classItem.course,
      year: classItem.year,
      section: classItem.section,
      subjects: classItem.subjects || [],
      studentIds: students.map((student, index) => getStudentDocumentId(student, index)),
      updatedAt: serverTimestamp()
    });
    await Promise.all(students.map(async (student, index) => {
      const studentId = getStudentDocumentId(student, index);
      const { assessments = [], ...profile } = student;
      const studentRef = doc(studentCollection, studentId);
      await setDoc(studentRef, { ...profile, id: studentId, recordType: 'student', studentName: student.name || '', studentDisplayName: student.displayName || student.name || '', classId: classItem.id, classLabel: `${classItem.course} · ${classItem.year} · Section ${classItem.section}`, assessmentCount: assessments.length, updatedAt: serverTimestamp() });
      const assessmentCollection = collection(studentRef, 'assessments');
      const existingAssessments = await getDocs(assessmentCollection);
      await Promise.all(existingAssessments.docs.filter((snapshot) => !assessments.some((_, assessmentIndex) => snapshot.id === getAssessmentDocumentId(assessmentIndex))).map((snapshot) => deleteDoc(snapshot.ref)));
      await Promise.all(assessments.map((assessment, assessmentIndex) => setDoc(doc(assessmentCollection, getAssessmentDocumentId(assessmentIndex)), {
        ...assessment,
        id: getAssessmentDocumentId(assessmentIndex),
        recordType: 'assessment',
        studentId,
        studentName: student.name || '',
        studentDisplayName: student.displayName || student.name || '',
        classId: classItem.id,
        updatedAt: serverTimestamp()
      })));
    }));
  }));
}

async function deleteClassDocument(classRef) {
  const students = await getDocs(collection(classRef, 'students'));
  await Promise.all(students.docs.map((snapshot) => deleteStudentDocument(snapshot.ref)));
  await deleteDoc(classRef);
}

async function deleteStudentDocument(studentRef) {
  const assessmentSnapshots = await getDocs(collection(studentRef, 'assessments'));
  await Promise.all(assessmentSnapshots.docs.map((snapshot) => deleteDoc(snapshot.ref)));
  await deleteDoc(studentRef);
}

async function loadStudentPulseClasses(userId) {
  const classSnapshots = await getDocs(collection(db, 'users', userId, 'studentPulseClasses'));
  if (!classSnapshots.docs.length) return null;
  return Promise.all(classSnapshots.docs.map(async (classSnapshot) => {
    const classData = classSnapshot.data();
    const studentSnapshots = await getDocs(collection(classSnapshot.ref, 'students'));
    if (!studentSnapshots.docs.length && Array.isArray(classData.students)) return classData;
    const students = await Promise.all(studentSnapshots.docs.map(async (studentSnapshot) => {
      const assessmentSnapshots = await getDocs(collection(studentSnapshot.ref, 'assessments'));
      return { ...studentSnapshot.data(), assessments: assessmentSnapshots.docs.sort((a, b) => a.id.localeCompare(b.id)).map((assessmentSnapshot) => assessmentSnapshot.data()) };
    }));
    return { ...classData, students };
  }));
}

function getStudentDocumentId(student, index) {
  const base = String(student.name || student.displayName || `student-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'student'}-${index}`;
}
function getAssessmentDocumentId(index) {
  return `assessment-${String(index).padStart(4, '0')}`;
}

window.studentPulseFirebase = {
  app,
  auth,
  analytics,
  db,
  createAccount,
  signIn,
  signOut: () => signOut(auth),
  onAuthStateChanged: (callback, onError) => onAuthStateChanged(auth, callback, onError),
  saveStudentPulseClasses,
  loadStudentPulseClasses
};
window.dispatchEvent(new CustomEvent('studentpulse:firebase-ready'));
