import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createTestInbox } from '../tooling/test-inbox.ts';

const candidates = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal);
const host =
  process.env.TURN_LAN_IP ??
  candidates.find((n) =>
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
  )?.address;
if (!host)
  throw new Error(
    'No LAN address found. Set TURN_LAN_IP to this computer’s Wi-Fi/Ethernet IPv4 address.',
  );
const port = Number(process.env.TURN_INBOX_PORT ?? 8083);
const token = randomBytes(32).toString('hex');
const directory = resolve('work/test-inbox');
const receiver = createTestInbox(directory, token);
receiver.listen(port, '0.0.0.0', () => {
  console.log(
    `Private test inbox ready at ${host}:${port}; recordings saved in ${directory}`,
  );
  const expo = spawn(
    process.execPath,
    [
      'node_modules/expo/bin/cli',
      'start',
      'apps/mobile',
      '--go',
      '--lan',
      '--port',
      '8081',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        REACT_NATIVE_PACKAGER_HOSTNAME: host,
        EXPO_PUBLIC_TEST_INBOX_URL: `http://${host}:${port}`,
        EXPO_PUBLIC_TEST_INBOX_TOKEN: token,
      },
    },
  );
  const stop = () => {
    expo.kill();
    receiver.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  expo.on('exit', (code) => {
    receiver.close();
    process.exitCode = code ?? 0;
  });
  expo.on('error', (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
});
receiver.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
