import { useState } from "react";
import Learn from "./components/Learn";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import OptionsView from "./components/OptionsView";
import { loadOptions, type Options } from "./components/optionsStore";
import TitleView from "./components/TitleView";
import ErrorBoundary from "./components/ErrorBoundary";

type Screen = "title" | "learn" | "review" | "stats" | "options" | "list";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [options, setOptions] = useState<Options>(() => loadOptions());

  let content: React.ReactNode = null;

  if (screen === "title") {
    content = (
      <TitleView
        onStartLearn={() => setScreen("learn")}
        onStartReview={() => setScreen("review")}
        onOpenStats={() => setScreen("stats")}
        onOpenOptions={() => setScreen("options")}
        onOpenList={() => setScreen("list")}
      />
    );
  } else if (screen === "options") {
    content = <OptionsView value={options} onChange={(v) => setOptions(v)} onBack={() => setScreen("title")} />;
  } else if (screen === "stats") {
    content = <StatsView onBack={() => setScreen("title")} />;
  } else if (screen === "list") {
    content = <SenatorList onBack={() => setScreen("title")} />;
  } else if (screen === "learn") {
    content = <Learn mode="learn" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "review") {
    content = <Learn mode="review" onBackTitle={() => setScreen("title")} />;
  }

  return <ErrorBoundary>{content}</ErrorBoundary>;
}
