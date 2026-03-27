import { useEffect, useState } from "react";
import Learn from "./components/Learn";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import OptionsView from "./components/OptionsView";
import BackupView from "./components/BackupView";
import AutoPlayView from "./components/AutoPlayView";
import { loadOptions, type Options } from "./components/optionsStore";
import TitleView from "./components/TitleView";
import ErrorBoundary from "./components/ErrorBoundary";
import FirstGuide, { FIRST_GUIDE_SEEN_KEY } from "./components/FirstGuide";
import { getAvailableTargets, type AppMode, type Target } from "./components/data";

type Screen = "title" | "learn" | "reverse" | "review" | "autoplay" | "stats" | "options" | "list" | "backup";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [appMode, setAppMode] = useState<AppMode>("basic");
  const [target, setTarget] = useState<Target>("senators");
  const [options, setOptions] = useState<Options>(() => loadOptions());
  const [guideOpen, setGuideOpen] = useState(() => {
    const shouldOpen = !localStorage.getItem(FIRST_GUIDE_SEEN_KEY);
    if (shouldOpen) localStorage.setItem(FIRST_GUIDE_SEEN_KEY, "1");
    return shouldOpen;
  });

  useEffect(() => {
    const availableTargets = getAvailableTargets(appMode);
    if (!availableTargets.includes(target)) {
      Promise.resolve().then(() => {
        setTarget(availableTargets[0]);
      });
    }
  }, [appMode, target]);

  let content: React.ReactNode = null;

  if (screen === "title") {
    content = (
      <TitleView
        appMode={appMode}
        onChangeAppMode={setAppMode}
        target={target}
        onChangeTarget={setTarget}
        onOpenFirstGuide={() => setGuideOpen(true)}
        onStartLearn={() => setScreen("learn")}
        onStartReverse={() => setScreen("reverse")}
        onStartReview={() => setScreen("review")}
        onOpenAutoplay={() => setScreen("autoplay")}
        onOpenStats={() => setScreen("stats")}
        onOpenOptions={() => setScreen("options")}
        onOpenList={() => setScreen("list")}
        onOpenBackup={() => setScreen("backup")}
      />
    );
  } else if (screen === "options") {
    content = <OptionsView value={options} onChange={(v) => setOptions(v)} onBack={() => setScreen("title")} />;
  } else if (screen === "stats") {
    content = <StatsView appMode={appMode} target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "list") {
    content = <SenatorList appMode={appMode} target={target} onChangeTarget={setTarget} onBack={() => setScreen("title")} />;
  } else if (screen === "learn") {
    content = <Learn appMode={appMode} target={target} mode="learn" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "reverse") {
    content = <Learn appMode={appMode} target={target} mode="reverse" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "review") {
    content = <Learn appMode={appMode} target={target} mode="review" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "autoplay") {
    content = <AutoPlayView appMode={appMode} target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "backup") {
    content = <BackupView onBack={() => setScreen("title")} />;
  }

  return (
    <ErrorBoundary>
      {content}
      <FirstGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </ErrorBoundary>
  );
}
