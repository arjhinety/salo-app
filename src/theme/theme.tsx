import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useReduceMotion } from '../a11y/reduceMotion';
import { DARK, LIGHT, type Palette } from './tokens';

interface Theme {
  c: Palette;
  dark: boolean;
  /** Android "Remove animations": motion becomes instant cuts or crossfades. */
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme>({ c: LIGHT, dark: false, reduceMotion: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const reduceMotion = useReduceMotion();
  const dark = scheme === 'dark';
  return <ThemeContext.Provider value={{ c: dark ? DARK : LIGHT, dark, reduceMotion }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
