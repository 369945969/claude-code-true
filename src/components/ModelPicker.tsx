import figures from 'figures'
import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import { capitalize } from 'src/utils/stringUtils.js'
import { Box, Text } from '@anthropic/ink'
import { useKeybinding, useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js'
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/index.js'
import { Byline, KeyboardShortcutHint, Pane } from '@anthropic/ink'
import { effortLevelToSymbol } from './EffortIndicator.js'
import TextInput from './TextInput.js'

export type Props = {
  initial: string | null
  sessionModel?: ModelSetting
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void
  onCancel?: () => void
  isStandaloneCommand?: boolean
  showFastModeNotice?: boolean
  /** Overrides the dim header line below "Select model". */
  headerText?: string
  /**
   * When true, skip writing effortLevel to userSettings on selection.
   * Used by the assistant installer wizard where the model choice is
   * project-scoped (written to the assistant's .claude/settings.json via
   * install.ts) and should not leak to the user's global ~/.claude/settings.
   */
  skipSettingsWrite?: boolean
}

const NO_PREFERENCE = '__NO_PREFERENCE__'
const OPENAI_CUSTOM_MODEL = '__OPENAI_CUSTOM_MODEL__'

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const exitState = useExitOnCtrlCDWithKeybindings()
  const maxVisible = 10
  const provider = getAPIProvider()

  const initialValue = initial === null ? NO_PREFERENCE : initial
  const [focusedValue, setFocusedValue] = useState<string | undefined>(
    initialValue,
  )

  const isFastMode = useAppState(s =>
    isFastModeEnabled() ? s.fastMode : false,
  )

  const [hasToggledEffort, setHasToggledEffort] = useState(false)
  const effortValue = useAppState(s => s.effortValue)
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined
      ? convertEffortValueToLevel(effortValue)
      : undefined,
  )

  // Memoize all derived values to prevent re-renders
  const modelOptions = useMemo(
    () => getModelOptions(isFastMode ?? false),
    [isFastMode],
  )

  const optionsWithProviderAdditions = useMemo(() => {
    if (provider !== 'openai') return modelOptions
    return [
      ...modelOptions,
      {
        value: OPENAI_CUSTOM_MODEL,
        label: 'Custom (OpenAI)',
        description: 'Enter a model ID for your OpenAI-compatible endpoint',
      },
    ]
  }, [modelOptions, provider])

  // Ensure the initial value is in the options list
  // This handles edge cases where the user's current model (e.g., 'haiku' for 3P users)
  // is not in the base options but should still be selectable and shown as selected
  const optionsWithInitial = useMemo(() => {
    if (
      initial !== null &&
      !optionsWithProviderAdditions.some(opt => opt.value === initial)
    ) {
      return [
        ...optionsWithProviderAdditions,
        {
          value: initial,
          label: modelDisplayString(initial),
          description: 'Current model',
        },
      ]
    }
    return optionsWithProviderAdditions
  }, [optionsWithProviderAdditions, initial])

  const selectOptions = useMemo(
    () =>
      optionsWithInitial.map(opt => ({
        ...opt,
        value: opt.value === null ? NO_PREFERENCE : opt.value,
      })),
    [optionsWithInitial],
  )
  const initialFocusValue = useMemo(
    () =>
      selectOptions.some(_ => _.value === initialValue)
        ? initialValue
        : (selectOptions[0]?.value ?? undefined),
    [selectOptions, initialValue],
  )
  const visibleCount = Math.min(maxVisible, selectOptions.length)
  const hiddenCount = Math.max(0, selectOptions.length - visibleCount)

  const focusedModelName = selectOptions.find(
    opt => opt.value === focusedValue,
  )?.label
  const focusedModel = resolveOptionModel(focusedValue)
  const focusedSupportsEffort = focusedModel
    ? modelSupportsEffort(focusedModel)
    : false
  const focusedSupportsMax = focusedModel
    ? modelSupportsMaxEffort(focusedModel)
    : false
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedValue)
  // Clamp display when 'max' is selected but the focused model doesn't support it.
  // resolveAppliedEffort() does the same downgrade at API-send time.
  const displayEffort =
    effort === 'max' && !focusedSupportsMax ? 'high' : effort

  const [isEnteringCustomModel, setIsEnteringCustomModel] = useState(false)
  const [customModelInput, setCustomModelInput] = useState(() => {
    if (provider !== 'openai') return ''
    if (initial === null) return ''
    const isBuiltIn = optionsWithProviderAdditions.some(
      opt => opt.value === initial,
    )
    return isBuiltIn ? '' : initial
  })
  const [customModelCursorOffset, setCustomModelCursorOffset] = useState(() => {
    if (provider !== 'openai') return 0
    return customModelInput.length
  })

  useKeybinding(
    'confirm:no',
    () => {
      if (!isEnteringCustomModel) return
      setIsEnteringCustomModel(false)
    },
    { context: 'Settings' },
  )

  const handleFocus = useCallback(
    (value: string) => {
      setFocusedValue(value)
      if (!hasToggledEffort && effortValue === undefined) {
        setEffort(getDefaultEffortLevelForOption(value))
      }
    },
    [hasToggledEffort, effortValue],
  )

  // Effort level cycling keybindings
  const handleCycleEffort = useCallback(
    (direction: 'left' | 'right') => {
      if (!focusedSupportsEffort) return
      setEffort(prev =>
        cycleEffortLevel(
          prev ?? focusedDefaultEffort,
          direction,
          focusedSupportsMax,
        ),
      )
      setHasToggledEffort(true)
    },
    [focusedSupportsEffort, focusedSupportsMax, focusedDefaultEffort],
  )

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    },
    { context: 'ModelPicker' },
  )

  const persistEffortSelection = useCallback(
    (value: string) => {
      logEvent('tengu_model_command_menu_effort', {
        effort:
          effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      if (!skipSettingsWrite) {
        const effortLevel = resolvePickerEffortPersistence(
          effort,
          getDefaultEffortLevelForOption(value),
          getSettingsForSource('userSettings')?.effortLevel,
          hasToggledEffort,
        )
        const persistable = toPersistableEffort(effortLevel)
        if (persistable !== undefined) {
          updateSettingsForSource('userSettings', { effortLevel: persistable })
        }
        setAppState(prev => ({ ...prev, effortValue: effortLevel }))
      }
    },
    [
      effort,
      hasToggledEffort,
      setAppState,
      skipSettingsWrite,
      getDefaultEffortLevelForOption,
    ],
  )

  function handleSelect(value: string): void {
    if (value === OPENAI_CUSTOM_MODEL) {
      setIsEnteringCustomModel(true)
      setCustomModelCursorOffset(customModelInput.length)
      return
    }

    persistEffortSelection(value)

    const selectedModel = resolveOptionModel(value)
    const selectedEffort =
      hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel)
        ? effort
        : undefined
    if (value === NO_PREFERENCE) {
      onSelect(null, selectedEffort)
      return
    }
    onSelect(value, selectedEffort)
  }

  const customHeaderText =
    provider === 'openai'
      ? 'Switch the model ID for your OpenAI-compatible endpoint. This applies to this session and future sessions.'
      : undefined

  const content = (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold>
            Select model
          </Text>
          <Text dimColor>
            {headerText ??
              customHeaderText ??
              'Switch between Claude models. Applies to this session and future Claude Code sessions. For other/previous model names, specify with --model.'}
          </Text>
          {sessionModel && (
            <Text dimColor>
              Currently using {modelDisplayString(sessionModel)} for this
              session (set by plan mode). Selecting a model will undo this.
            </Text>
          )}
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {isEnteringCustomModel ? (
            <Box flexDirection="column" gap={1}>
              <Text>Enter OpenAI model ID:</Text>
              <Box flexDirection="row" gap={1}>
                <Text>{figures.pointer}</Text>
                <TextInput
                  value={customModelInput}
                  onChange={setCustomModelInput}
                  onSubmit={() => {
                    const trimmed = customModelInput.trim()
                    if (!trimmed) {
                      setIsEnteringCustomModel(false)
                      return
                    }
                    persistEffortSelection(trimmed)
                    const selectedModel = trimmed
                    const selectedEffort =
                      hasToggledEffort && modelSupportsEffort(selectedModel)
                        ? effort
                        : undefined
                    setIsEnteringCustomModel(false)
                    onSelect(selectedModel, selectedEffort)
                  }}
                  focus={true}
                  showCursor={true}
                  placeholder={`e.g., qwen2.5-coder${figures.ellipsis}`}
                  columns={60}
                  cursorOffset={customModelCursorOffset}
                  onChangeCursorOffset={setCustomModelCursorOffset}
                />
              </Box>
              <Text dimColor>Press Esc to go back</Text>
            </Box>
          ) : (
            <>
              <Box flexDirection="column">
                <Select
                  defaultValue={initialValue}
                  defaultFocusValue={initialFocusValue}
                  options={selectOptions}
                  onChange={handleSelect}
                  onFocus={handleFocus}
                  onCancel={onCancel ?? (() => {})}
                  visibleOptionCount={visibleCount}
                />
              </Box>
              {hiddenCount > 0 && (
                <Box paddingLeft={3}>
                  <Text dimColor>and {hiddenCount} more…</Text>
                </Box>
              )}
            </>
          )}
        </Box>

        <Box marginBottom={1} flexDirection="column">
          {focusedSupportsEffort ? (
            <Text dimColor>
              <EffortLevelIndicator effort={displayEffort} />{' '}
              {capitalize(displayEffort)} effort
              {displayEffort === focusedDefaultEffort ? ` (default)` : ``}{' '}
              <Text color="subtle">← → to adjust</Text>
            </Text>
          ) : (
            <Text color="subtle">
              <EffortLevelIndicator effort={undefined} /> Effort not supported
              {focusedModelName ? ` for ${focusedModelName}` : ''}
            </Text>
          )}
        </Box>

        {isFastModeEnabled() ? (
          showFastModeNotice ? (
            <Box marginBottom={1}>
              <Text dimColor>
                Fast mode is <Text bold>ON</Text> and available with{' '}
                {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other
                models turn off fast mode.
              </Text>
            </Box>
          ) : isFastModeAvailable() && !isFastModeCooldown() ? (
            <Box marginBottom={1}>
              <Text dimColor>
                Use <Text bold>/fast</Text> to turn on Fast mode (
                {FAST_MODE_MODEL_DISPLAY} only).
              </Text>
            </Box>
          ) : null
        ) : null}
      </Box>

      {isStandaloneCommand && (
        <Text dimColor italic>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          )}
        </Text>
      )}
    </Box>
  )

  if (!isStandaloneCommand) {
    return content
  }

  return <Pane color="permission">{content}</Pane>
}

function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined
  return value === NO_PREFERENCE
    ? getDefaultMainLoopModel()
    : parseUserSpecifiedModel(value)
}

function EffortLevelIndicator({
  effort,
}: {
  effort?: EffortLevel
}): React.ReactNode {
  return (
    <Text color={effort ? 'claude' : 'subtle'}>
      {effortLevelToSymbol(effort ?? 'low')}
    </Text>
  )
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  includeMax: boolean,
): EffortLevel {
  const levels: EffortLevel[] = includeMax
    ? ['low', 'medium', 'high', 'max']
    : ['low', 'medium', 'high']
  // If the current level isn't in the cycle (e.g. 'max' after switching to a
  // non-Opus model), clamp to 'high'.
  const idx = levels.indexOf(current)
  const currentIndex = idx !== -1 ? idx : levels.indexOf('high')
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!
  } else {
    return levels[(currentIndex - 1 + levels.length) % levels.length]!
  }
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel()
  const defaultValue = getDefaultEffortForModel(resolved)
  return defaultValue !== undefined
    ? convertEffortValueToLevel(defaultValue)
    : 'high'
}
