import r400 from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import r500 from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf';
import r600 from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf';
import r700 from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { cssVariables } from '@turn/design';
import { App } from './App';
import './styles.css';

// Design tokens as CSS variables, and Inter served from this app (no third-party font requests).
const tokens = document.createElement('style');
tokens.textContent = cssVariables();
document.head.prepend(tokens);
for (const [url, weight] of [
  [r400, '400'],
  [r500, '500'],
  [r600, '600'],
  [r700, '700'],
] as const)
  void new FontFace('Inter', `url(${url})`, { weight })
    .load()
    .then((f) => document.fonts.add(f))
    .catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
