import React, { useState, useEffect } from 'react';
import InstructorLogin from './InstructorLogin';
import InstructorDashboard from './InstructorDashboard';

export default function InstructorApp() {
  const [instructor, setInstructor] = useState(null);

  useEffect(() => {
    // ローカルストレージから講師情報を読み込む
    const savedInstructor = localStorage.getItem('instructor_session');
    if (savedInstructor) {
      try {
        setInstructor(JSON.parse(savedInstructor));
      } catch (e) {
        console.error('講師情報の読み込みエラー:', e);
      }
    }
  }, []);

  const handleLogin = (instructorData) => {
    setInstructor(instructorData);
    localStorage.setItem('instructor_session', JSON.stringify(instructorData));
  };

  const handleLogout = () => {
    setInstructor(null);
    localStorage.removeItem('instructor_session');
  };

  if (!instructor) {
    return <InstructorLogin onLogin={handleLogin} />;
  }

  return <InstructorDashboard instructor={instructor} onLogout={handleLogout} />;
}

