import { useMemo, useState } from "react";
import Quiz from "./components/Quiz";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import OptionsView, { loadOptions, type Options } from "./components/OptionsView";
import TitleView from "./components/TitleView";

type Screen = "title" | "quiz" | "review" | "stats" | "options" | "list";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [options, setOptions] = useState<Options>(() => loadOptions());

  const quizCount = useMemo(() => {
    const n = Number(options.quizCount);
    if (!Number.isFinite(n)) return 20;
    return Math.max(10, Math.min(200, Math.round(n / 10) * 10));
  }, [options.quizCount]);

  if (screen === "title") {
    return (
      <TitleView
        onStartQuiz={() => setScreen("quiz")}
        onStartReview={() => setScreen("review")}
        onOpenStats={() => setScreen("stats")}
        onOpenOptions={() => setScreen("options")}
        onOpenList={() => setScreen("list")}
      />
    );
  }

  if (screen === "options") {
    return (
      <OptionsView
        value={options}
        onChange={(v) => setOptions(v)}
        onBack={() => setScreen("title")}
      />
    );
  }

  if (screen === "stats") {
    return <StatsView onBack={() => setScreen("title")} />;
  }

  if (screen === "list") {
    return <SenatorList onBack={() => setScreen("title")} />;
  }

  return (
    <Quiz
      initialMode={screen === "review" ? "review" : "normal"}
      normalCount={quizCount}
      onBackTitle={() => setScreen("title")}
    />
  );
}