import type { PluginItem } from '@babel/core';
import tastyZero from '@tenphi/tasty/babel-plugin';
import type { TastyZeroBabelOptions } from '@tenphi/tasty/babel-plugin';

const options: TastyZeroBabelOptions = { mode: 'inject' };

export const plugins: PluginItem[] = [tastyZero, [tastyZero, options]];
