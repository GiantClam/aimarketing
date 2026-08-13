/**
 * Compatibility surface for existing SaaS callers.
 *
 * The implementation lives in the host-neutral runtime-contracts package so
 * desktop and SaaS cannot silently diverge.
 */
export {
  buildOpenCodeCommand,
  createOpenCodeEventParser,
  opencodeRuntimeDefinition,
} from "@aimarketing/runtime-contracts/opencode"
