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
import { randomUUID } from 'crypto'
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
import { validateModel } from '../utils/model/validateModel.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'
import { clearOpenAIClientCache } from '../services/api/openai/client.js'

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
const CUSTOM_ADD = '__CUSTOM_ADD__'
const CUSTOM_PREFIX = '__CUSTOM_SAVED__:'
const CUSTOM_ACTION_USE = '__CUSTOM_ACTION_USE__'
const CUSTOM_ACTION_EDIT = '__CUSTOM_ACTION_EDIT__'
const CUSTOM_ACTION_DELETE = '__CUSTOM_ACTION_DELETE__'
const CUSTOM_ACTION_BACK = '__CUSTOM_ACTION_BACK__'

type CustomModelConfig = {
  id: string
  label?: string
  provider: 'openai'
  baseUrl?: string
  apiKey?: string
  model: string
}

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

  const [customModels, setCustomModels] = useState<CustomModelConfig[]>(
    () => getSettingsForSource('userSettings')?.customModels ?? [],
  )
  const [activeCustomModelId, setActiveCustomModelId] = useState<
    string | undefined
  >(() => getSettingsForSource('userSettings')?.activeCustomModelId)

  const initialValue = useMemo(() => {
    if (initial === null) return NO_PREFERENCE
    const active =
      activeCustomModelId &&
      customModels.find(m => m.id === activeCustomModelId && m.model === initial)
    if (active) {
      return `${CUSTOM_PREFIX}${active.id}`
    }
    return initial
  }, [activeCustomModelId, customModels, initial])

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
    const customModelIds = new Set(customModels.map(m => m.model))
    const filteredModelOptions = modelOptions.filter(opt => {
      if (typeof opt.value !== 'string') return true
      if (!customModelIds.has(opt.value)) return true
      const desc = typeof opt.description === 'string' ? opt.description : ''
      if (!desc.toLowerCase().includes('custom model')) return true
      return false
    })

    const customOptions = customModels.map(m => {
      let suffix = ''
      if (m.baseUrl) {
        try {
          suffix = ` · ${new URL(m.baseUrl).host}`
        } catch {
          suffix = ` · ${m.baseUrl}`
        }
      }
      return {
        value: `${CUSTOM_PREFIX}${m.id}`,
        label: m.label ?? m.model,
        description: `${m.provider.toUpperCase()}${suffix}`,
      }
    })
    return [
      ...filteredModelOptions,
      ...customOptions,
      {
        value: CUSTOM_ADD,
        label: provider === 'openai' ? 'Add custom model (OpenAI)' : 'Add custom model',
        description:
          provider === 'openai'
            ? 'Save another OpenAI-compatible model configuration'
            : 'Save another custom model configuration',
      },
    ]
  }, [customModels, modelOptions, provider])

  // Ensure the initial value is in the options list
  // This handles edge cases where the user's current model (e.g., 'haiku' for 3P users)
  // is not in the base options but should still be selectable and shown as selected
  const optionsWithInitial = useMemo(() => {
    if (
      initial !== null &&
      !optionsWithProviderAdditions.some(opt => opt.value === initialValue)
    ) {
      return [
        ...optionsWithProviderAdditions,
        {
          value: initialValue,
          label: modelDisplayString(initialValue),
          description: 'Current model',
        },
      ]
    }
    return optionsWithProviderAdditions
  }, [optionsWithProviderAdditions, initial, initialValue])

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

  const [customPanel, setCustomPanel] = useState<
    | { state: 'none' }
    | { state: 'actions'; id: string }
    | { state: 'form'; mode: 'add' | 'edit'; id?: string }
  >({ state: 'none' })

  type CustomField = 'label' | 'base_url' | 'api_key' | 'model_id'
  const FORM_FIELDS: CustomField[] = ['label', 'base_url', 'api_key', 'model_id']
  const [activeField, setActiveField] = useState<CustomField>('label')
  const [labelValue, setLabelValue] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('')
  const displayValues: Record<CustomField, string> = useMemo(
    () => ({
      label: labelValue,
      base_url: baseUrl,
      api_key: apiKey,
      model_id: modelId,
    }),
    [apiKey, baseUrl, labelValue, modelId],
  )
  const [inputValue, setInputValue] = useState('')
  const [inputCursorOffset, setInputCursorOffset] = useState(0)
  const [isValidatingCustomModel, setIsValidatingCustomModel] = useState(false)
  const [customModelError, setCustomModelError] = useState<string | null>(null)

  useKeybinding(
    'confirm:no',
    () => {
      if (customPanel.state === 'none') return
      setCustomModelError(null)
      setIsValidatingCustomModel(false)
      setCustomPanel({ state: 'none' })
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

  const setActiveFieldValue = useCallback(
    (field: CustomField, value: string) => {
      switch (field) {
        case 'label':
          setLabelValue(value)
          return
        case 'base_url':
          setBaseUrl(value)
          return
        case 'api_key':
          setApiKey(value)
          return
        case 'model_id':
          setModelId(value)
          return
      }
    },
    [],
  )

  const handleCustomEnter = useCallback(() => {
    if (customPanel.state !== 'form') return

    const idx = FORM_FIELDS.indexOf(activeField)
    const isLast = idx === FORM_FIELDS.length - 1
    setActiveFieldValue(activeField, inputValue)
    if (!isLast) {
      const next = FORM_FIELDS[idx + 1]!
      setActiveField(next)
      setInputValue(displayValues[next] ?? '')
      setInputCursorOffset((displayValues[next] ?? '').length)
      return
    }

    void (async () => {
      setCustomModelError(null)

      const finalLabel = (activeField === 'label' ? inputValue : labelValue).trim()
      const finalBaseUrl = (activeField === 'base_url' ? inputValue : baseUrl).trim()
      const finalApiKey = (activeField === 'api_key' ? inputValue : apiKey).trim()
      const finalModelId = (activeField === 'model_id' ? inputValue : modelId).trim()

      if (!finalModelId) {
        setCustomPanel({ state: 'none' })
        return
      }

      const idForUniqueness =
        customPanel.mode === 'edit' && customPanel.id ? customPanel.id : undefined
      if (finalLabel) {
        const normalized = finalLabel.toLowerCase()
        const labelExists = customModels.some(m => {
          if (idForUniqueness && m.id === idForUniqueness) return false
          const existing = (m.label ?? m.model).trim().toLowerCase()
          return existing === normalized
        })
        if (labelExists) {
          setCustomModelError(`Label '${finalLabel}' already exists`)
          return
        }
      }

      const shouldConfigureOpenAI =
        provider === 'openai' || finalBaseUrl.length > 0 || finalApiKey.length > 0

      if (shouldConfigureOpenAI) {
        if (finalBaseUrl) {
          try {
            new URL(finalBaseUrl)
          } catch {
            setCustomModelError(
              'Invalid base URL: please enter a full URL including protocol (e.g., http://localhost:11434/v1)',
            )
            return
          }
        }

        const env: Record<string, string> = {}
        if (finalBaseUrl) env.OPENAI_BASE_URL = finalBaseUrl
        env.OPENAI_API_KEY = finalApiKey || 'dummy'
        updateSettingsForSource('userSettings', {
          modelType: 'openai' as any,
          env,
        } as any)
        applyConfigEnvironmentVariables()
        clearOpenAIClientCache()
      }

      setIsValidatingCustomModel(true)
      const { valid, error } = await validateModel(finalModelId)
      setIsValidatingCustomModel(false)

      if (!valid) {
        setCustomModelError(error ?? `Model '${finalModelId}' not found`)
        return
      }

      const id =
        customPanel.mode === 'edit' && customPanel.id ? customPanel.id : randomUUID()
      const entry: CustomModelConfig = {
        id,
        provider: 'openai',
        ...(finalLabel ? { label: finalLabel } : {}),
        ...(finalBaseUrl ? { baseUrl: finalBaseUrl } : {}),
        ...(finalApiKey ? { apiKey: finalApiKey } : {}),
        model: finalModelId,
      }

      const nextCustomModels =
        customPanel.mode === 'edit'
          ? customModels.map(m => (m.id === id ? entry : m))
          : [...customModels, entry]

      setCustomModels(nextCustomModels)
      setActiveCustomModelId(id)
      updateSettingsForSource('userSettings', {
        customModels: nextCustomModels as any,
        activeCustomModelId: id,
      } as any)

      persistEffortSelection(finalModelId)
      const selectedEffort =
        hasToggledEffort && modelSupportsEffort(finalModelId) ? effort : undefined
      setCustomPanel({ state: 'none' })
      onSelect(finalModelId, selectedEffort)
    })()
  }, [
    activeField,
    customPanel,
    customModels,
    apiKey,
    baseUrl,
    displayValues,
    effort,
    hasToggledEffort,
    inputValue,
    labelValue,
    modelId,
    onSelect,
    persistEffortSelection,
    provider,
    setActiveFieldValue,
  ])

  useKeybinding(
    'tabs:next',
    () => {
      if (customPanel.state !== 'form') return
      const idx = FORM_FIELDS.indexOf(activeField)
      if (idx < FORM_FIELDS.length - 1) {
        setActiveFieldValue(activeField, inputValue)
        const next = FORM_FIELDS[idx + 1]!
        setActiveField(next)
        setInputValue(displayValues[next] ?? '')
        setInputCursorOffset((displayValues[next] ?? '').length)
      }
    },
    { context: 'FormField', isActive: customPanel.state === 'form' },
  )

  useKeybinding(
    'tabs:previous',
    () => {
      if (customPanel.state !== 'form') return
      const idx = FORM_FIELDS.indexOf(activeField)
      if (idx > 0) {
        setActiveFieldValue(activeField, inputValue)
        const prev = FORM_FIELDS[idx - 1]!
        setActiveField(prev)
        setInputValue(displayValues[prev] ?? '')
        setInputCursorOffset((displayValues[prev] ?? '').length)
      }
    },
    { context: 'FormField', isActive: customPanel.state === 'form' },
  )

  const applyCustomModel = useCallback(
    async (entry: CustomModelConfig) => {
      const finalBaseUrl = (entry.baseUrl ?? '').trim()
      const finalApiKey = (entry.apiKey ?? '').trim()
      const finalModelId = entry.model.trim()

      if (finalBaseUrl) {
        try {
          new URL(finalBaseUrl)
        } catch {
          setCustomModelError(
            'Invalid base URL: please enter a full URL including protocol (e.g., http://localhost:11434/v1)',
          )
          return
        }
      }

      const env: Record<string, string> = {}
      if (finalBaseUrl) env.OPENAI_BASE_URL = finalBaseUrl
      env.OPENAI_API_KEY = finalApiKey || 'dummy'
      updateSettingsForSource('userSettings', {
        modelType: 'openai' as any,
        env,
        activeCustomModelId: entry.id,
      } as any)
      applyConfigEnvironmentVariables()
      clearOpenAIClientCache()
      setActiveCustomModelId(entry.id)

      setIsValidatingCustomModel(true)
      const { valid, error } = await validateModel(finalModelId)
      setIsValidatingCustomModel(false)
      if (!valid) {
        setCustomModelError(error ?? `Model '${finalModelId}' not found`)
        return
      }

      persistEffortSelection(finalModelId)
      const selectedEffort =
        hasToggledEffort && modelSupportsEffort(finalModelId) ? effort : undefined
      setCustomPanel({ state: 'none' })
      onSelect(finalModelId, selectedEffort)
    },
    [effort, hasToggledEffort, onSelect, persistEffortSelection],
  )

  function handleSelect(value: string): void {
    if (value === CUSTOM_ADD) {
      setCustomModelError(null)
      setIsValidatingCustomModel(false)
      setCustomPanel({ state: 'form', mode: 'add' })
      setActiveField('label')
      setLabelValue('')
      setBaseUrl('')
      setApiKey('')
      setModelId('')
      setInputValue('')
      setInputCursorOffset(0)
      return
    }
    if (value.startsWith(CUSTOM_PREFIX)) {
      const id = value.slice(CUSTOM_PREFIX.length)
      setCustomModelError(null)
      setIsValidatingCustomModel(false)
      setCustomPanel({ state: 'actions', id })
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
      : 'Switch between Claude models. Applies to this session and future Claude Code sessions.'

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
          {customPanel.state === 'form' ? (
            <Box flexDirection="column" gap={1}>
              <Text>Enter model config:</Text>
              <Box flexDirection="column" gap={1}>
                <Box>
                  <Text
                    backgroundColor={activeField === 'label' ? 'suggestion' : undefined}
                    color={activeField === 'label' ? 'inverseText' : undefined}
                  >
                    {' Label   '}
                  </Text>
                  <Text> </Text>
                  {activeField === 'label' ? (
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleCustomEnter}
                      cursorOffset={inputCursorOffset}
                      onChangeCursorOffset={setInputCursorOffset}
                      columns={60}
                      focus={true}
                      placeholder={`e.g., Local Ollama${figures.ellipsis}`}
                    />
                  ) : labelValue ? (
                    <Text color="success">{labelValue}</Text>
                  ) : null}
                </Box>
                <Box>
                  <Text
                    backgroundColor={activeField === 'base_url' ? 'suggestion' : undefined}
                    color={activeField === 'base_url' ? 'inverseText' : undefined}
                  >
                    {' Base URL '}
                  </Text>
                  <Text> </Text>
                  {activeField === 'base_url' ? (
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleCustomEnter}
                      cursorOffset={inputCursorOffset}
                      onChangeCursorOffset={setInputCursorOffset}
                      columns={60}
                      focus={true}
                      placeholder={`e.g., http://localhost:11434/v1${figures.ellipsis}`}
                    />
                  ) : baseUrl ? (
                    <Text color="success">{baseUrl}</Text>
                  ) : null}
                </Box>
                <Box>
                  <Text
                    backgroundColor={activeField === 'api_key' ? 'suggestion' : undefined}
                    color={activeField === 'api_key' ? 'inverseText' : undefined}
                  >
                    {' API Key  '}
                  </Text>
                  <Text> </Text>
                  {activeField === 'api_key' ? (
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleCustomEnter}
                      cursorOffset={inputCursorOffset}
                      onChangeCursorOffset={setInputCursorOffset}
                      columns={60}
                      focus={true}
                      mask="*"
                      placeholder={`(any string works for most local endpoints)${figures.ellipsis}`}
                    />
                  ) : apiKey ? (
                    <Text color="success">
                      {apiKey.slice(0, 8) + '\u00b7'.repeat(Math.max(0, apiKey.length - 8))}
                    </Text>
                  ) : null}
                </Box>
                <Box>
                  <Text
                    backgroundColor={activeField === 'model_id' ? 'suggestion' : undefined}
                    color={activeField === 'model_id' ? 'inverseText' : undefined}
                  >
                    {' Model ID '}
                  </Text>
                  <Text> </Text>
                  {activeField === 'model_id' ? (
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={handleCustomEnter}
                      cursorOffset={inputCursorOffset}
                      onChangeCursorOffset={setInputCursorOffset}
                      columns={60}
                      focus={true}
                      placeholder={`e.g., qwen2.5-coder${figures.ellipsis}`}
                    />
                  ) : modelId ? (
                    <Text color="success">{modelId}</Text>
                  ) : null}
                </Box>
              </Box>
              <Text dimColor>
                Tab to switch · Enter on last field to save · Esc to go back
              </Text>
              {isValidatingCustomModel ? (
                <Text dimColor>Validating…</Text>
              ) : customModelError ? (
                <Text color="error">{customModelError}</Text>
              ) : (
                <Text dimColor>Press Esc to go back</Text>
              )}
            </Box>
          ) : customPanel.state === 'actions' ? (
            <Box flexDirection="column" gap={1}>
              <Text bold>Custom model</Text>
              <Select
                defaultValue={CUSTOM_ACTION_USE}
                defaultFocusValue={CUSTOM_ACTION_USE}
                options={[
                  {
                    value: CUSTOM_ACTION_USE,
                    label: 'Use',
                    description: 'Apply this model configuration',
                  },
                  {
                    value: CUSTOM_ACTION_EDIT,
                    label: 'Edit',
                    description: 'Modify base URL / API key / model ID',
                  },
                  {
                    value: CUSTOM_ACTION_DELETE,
                    label: 'Delete',
                    description: 'Remove this saved custom model',
                  },
                  {
                    value: CUSTOM_ACTION_BACK,
                    label: 'Back',
                    description: 'Return to model list',
                  },
                ]}
                onChange={value => {
                  const id = customPanel.id
                  const entry = customModels.find(m => m.id === id)
                  if (value === CUSTOM_ACTION_BACK) {
                    setCustomPanel({ state: 'none' })
                    return
                  }
                  if (!entry) {
                    setCustomPanel({ state: 'none' })
                    return
                  }
                  if (value === CUSTOM_ACTION_USE) {
                    void applyCustomModel(entry)
                    return
                  }
                  if (value === CUSTOM_ACTION_EDIT) {
                    setCustomModelError(null)
                    setIsValidatingCustomModel(false)
                    setCustomPanel({ state: 'form', mode: 'edit', id })
                    setActiveField('label')
                    setLabelValue(entry.label ?? '')
                    setBaseUrl(entry.baseUrl ?? '')
                    setApiKey(entry.apiKey ?? '')
                    setModelId(entry.model ?? '')
                    setInputValue(entry.label ?? '')
                    setInputCursorOffset((entry.label ?? '').length)
                    return
                  }
                  if (value === CUSTOM_ACTION_DELETE) {
                    const next = customModels.filter(m => m.id !== id)
                    setCustomModels(next)
                    const nextActive =
                      activeCustomModelId === id ? undefined : activeCustomModelId
                    setActiveCustomModelId(nextActive)
                    updateSettingsForSource('userSettings', {
                      customModels: next as any,
                      activeCustomModelId: nextActive,
                    } as any)
                    setCustomPanel({ state: 'none' })
                    return
                  }
                }}
                onFocus={() => {}}
                onCancel={() => setCustomPanel({ state: 'none' })}
                visibleOptionCount={4}
              />
              {isValidatingCustomModel ? (
                <Text dimColor>Validating…</Text>
              ) : customModelError ? (
                <Text color="error">{customModelError}</Text>
              ) : null}
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
  if (value.startsWith(CUSTOM_PREFIX)) {
    return undefined
  }
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
