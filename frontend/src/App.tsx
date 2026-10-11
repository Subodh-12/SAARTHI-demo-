
import { useEffect, useState } from "react";
import "./App.css";

type Lesson = {
  id: string;
  title: string;
  subtitle: string;
  question: string;
  options: string[];
  correct_option: number;
  explanation: string;
};

const API_URL = "http://127.0.0.1:8000";

export default function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/lesson`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Lesson could not be loaded");
        }
        return response.json();
      })
      .then((data: Lesson) => setLesson(data))
      .catch(() => {
        setError(
          "Could not load the lesson. Please check whether the backend is running."
        );
      });
  }, []);

  if (error) {
    return <main className="page"><p role="alert">{error}</p></main>;
  }

  if (!lesson) {
    return <main className="page"><p>Loading lesson...</p></main>;
  }

  const correct = selected === lesson.correct_option;

  return (
    <main className="page">
      <header className="topbar">
        <span className="brand">SAARTHI</span>
        <span className="language">Odia · ଓଡ଼ିଆ</span>
      </header>

      <section className="lesson">
        <p className="eyebrow">CLASS 9 · SCIENCE</p>
        <h1>{lesson.title}</h1>
        <p className="subtitle">{lesson.subtitle}</p>

        <div className="concept">
          <h2>Today's learning</h2>
          <p>
            Science helps us understand the nature, objects and
            events around us.
          </p>
        </div>

        <div className="quiz">
          <h2>Test yourself</h2>
          <p>{lesson.question}</p>

          <div className="options">
            {lesson.options.map((option, index) => (
              <button
                key={index}
                className={`option ${
                  selected === index ? "selected" : ""
                } ${
                  submitted && index === lesson.correct_option
                    ? "correct"
                    : ""
                } ${
                  submitted && selected === index && !correct
                    ? "incorrect"
                    : ""
                }`}
                disabled={submitted}
                onClick={() => setSelected(index)}
              >
                {index + 1}. {option}
              </button>
            ))}
          </div>

          {!submitted ? (
            <button
              className="primary"
              disabled={selected === null}
              onClick={() => setSubmitted(true)}
            >
              Submit answer
            </button>
          ) : (
            <div className="feedback" role="status">
              <h3>{correct ? "Correct! Well done." : "Not quite. Let's learn!"}</h3>
              <p>{lesson.explanation}</p>
              <button
                className="primary"
                onClick={() => {
                  setSelected(null);
                  setSubmitted(false);
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </section>

      <footer>SAARTHI · Keep learning</footer>
    </main>
  );
}
