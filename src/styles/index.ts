import { predefine, styleHandlers } from './predefined';

const { STYLE_HANDLER_MAP } = predefine();

export { STYLE_HANDLER_MAP, styleHandlers };
export * from './createStyle';
export {
  normalizeHandlerDefinition,
  registerHandler,
  resetHandlers,
} from './predefined';
