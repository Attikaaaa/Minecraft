export const buildChromiumArgs = ({ headless = true, noSandbox = false } = {}) => {
  const args = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ];
  if (headless) {
    args.push("--headless=new");
  }
  if (noSandbox) {
    args.push("--no-sandbox");
  }
  return args;
};

export const buildLaunchOptions = ({ headless = true, noSandbox = false } = {}) => ({
  headless,
  args: buildChromiumArgs({ headless, noSandbox }),
});

export const contextOptions = {
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
};
