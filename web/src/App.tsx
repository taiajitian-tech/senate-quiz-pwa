// 修正パッチ（該当箇所のみ例）
useEffect(() => {
  const availableTargets = getAvailableTargets(appMode);
  if (!availableTargets.includes(target)) {
    Promise.resolve().then(() => {
      setTarget(availableTargets[0]);
    });
  }
}, [appMode, target]);
