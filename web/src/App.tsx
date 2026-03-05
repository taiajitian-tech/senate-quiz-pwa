import { useState } from "react";
import Learn from "./components/Learn";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import OptionsView, { loadOptions, type Options } from "./components/OptionsView";
import TitleView from "./components/TitleView";

type Screen = "title" | "learn" | "review" | "stats" | "options" | "list";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [options, setOptions] = useState<Options>(() => loadOptions());

    if (!Number.isFinite(n)) return 20;
    return Math.max(10, Math.min(200, Math.round(n / 10) * 10));
  }, [options.quizCount]);

  if (screen === "title") {
    return (
      <TitleView
        onStartLearn={() => setScreen("learn")}
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

    if (screen === "learn") {
    return <Learn mode="learn" onBackTitle={() => setScreen("title")} />;
  }

  if (screen === "review") {
    return <Learn mode="review" onBackTitle={() => setScreen("title")} />;
  }

  return null;
}
