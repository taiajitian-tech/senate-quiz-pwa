import { useEffect, useState } from "react";
import Learn from "./components/Learn";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import OptionsView from "./components/OptionsView";
import { loadOptions, type Options } from "./components/optionsStore";
import TitleView from "./components/TitleView";
import ErrorBoundary from "./components/ErrorBoundary";
import FirstGuide from "./components/FirstGuide";
import type { TargetKey } from "./components/data";
import BackupView from "./components/BackupView";

type Screen = "title" | "learn" | "reverse" | "review" | "autoplay" | "stats" | "options" | "list" | "backup";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [target, setTarget] = useState<TargetKey>("senators");
  const [options, setOptions] = useState<Options>(() => loadOptions());
  const [firstOpen, setFirstOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("app-first-launch");
    if (!seen) {
      setFirstOpen(true);
      localStorage.setItem("app-first-launch", "done");
    }
  }, []);

  let content: React.ReactNode = null;

  if (screen === "title") {
    content = (
      <TitleView
        target={target}
        onChangeTarget={setTarget}
        onOpenFirst={() => setFirstOpen(true)}
        onStartLearn={() => setScreen("learn")}
        onStartReverse={() => setScreen("reverse")}
        onStartReview={() => setScreen("review")}
        onStartAutoplay={() => setScreen("autoplay")}
        onOpenStats={() => setScreen("stats")}
        onOpenOptions={() => setScreen("options")}
        onOpenList={() => setScreen("list")}
        onOpenBackup={() => setScreen("backup")}
      />
    );
  } else if (screen === "options") {
    content = <OptionsView value={options} onChange={(v) => setOptions(v)} onBack={() => setScreen("title")} />;
  } else if (screen === "stats") {
    content = <StatsView target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "list") {
    content = <SenatorList target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "learn") {
    content = <Learn target={target} mode="learn" options={options} onBackTitle={() => setScreen("title")} />;
  } else if (screen === "reverse") {
    content = <Learn target={target} mode="reverse" options={options} onBackTitle={() => setScreen("title")} />;
  } else if (screen === "review") {
    content = <Learn target={target} mode="review" options={options} onBackTitle={() => setScreen("title")} />;
  } else if (screen === "autoplay") {
    content = <Learn target={target} mode="autoplay" options={options} onBackTitle={() => setScreen("title")} />;
  } else if (screen === "backup") {
    content = <BackupView onBack={() => setScreen("title")} />;
  }

  return (
    <ErrorBoundary>
      {content}
      <FirstGuide open={firstOpen} onClose={() => setFirstOpen(false)} />
    </ErrorBoundary>
  );
}
