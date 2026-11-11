import { Alert } from 'antd'
import type { VariableData, VariableItemField, VariableType } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../../store/editor/EditorStore'
import { itemFieldAtPath } from '../../../../../../../../utils/variableScope'
import {
  describeReference,
  findVariableReferences,
  referenceRequiredType,
  type VariableReference,
} from '../../../../../../../../utils/variableUsage'
import './ReferenceImpactWarning.css'

// What a reference resolves to under a candidate definition, or undefined when
// its path no longer names anything — the silent failure an edit introduces.
function referenceTargetType(
  reference: VariableReference,
  type: VariableType,
  itemFields: VariableItemField[] | undefined,
): VariableType | undefined {
  if (reference.itemPath === '') return type
  if (type !== 'object-list') return undefined
  return itemFieldAtPath(itemFields, reference.itemPath)?.type
}

function isReferenceBroken(
  reference: VariableReference,
  type: VariableType,
  itemFields: VariableItemField[] | undefined,
): boolean {
  const target = referenceTargetType(reference, type, itemFields)
  if (target === undefined) return true
  const required = referenceRequiredType(reference.kind)
  return required !== undefined && target !== required
}

interface ReferenceImpactWarningProps {
  // The stored definition, which the references resolve against today.
  variable: VariableData
  // The pending one.
  type: VariableType
  itemFields: VariableItemField[] | undefined
}

// References the edit is about to break — the ones that resolve today and
// would not under the pending definition. Pre-existing breakage is left
// alone: this warns about what this change does, not about the template's
// state in general.
export function ReferenceImpactWarning({ variable, type, itemFields }: ReferenceImpactWarningProps) {
  const pages = useEditorStore(state => state.template?.pages)

  const newlyBroken = findVariableReferences(pages ?? [], variable._id).filter(
    reference =>
      isReferenceBroken(reference, type, itemFields) &&
      !isReferenceBroken(reference, variable.type, variable.itemFields)
  )

  if (newlyBroken.length === 0) return null

  return (
    <Alert
      type="warning"
      showIcon
      className="variable-impact-warning"
      message={`${newlyBroken.length} reference${newlyBroken.length === 1 ? '' : 's'} will stop resolving`}
      description={
        <ul className="variable-impact-list">
          {newlyBroken.slice(0, 5).map((reference, index) => (
            <li key={index}>{describeReference(reference, variable.name)}</li>
          ))}
          {newlyBroken.length > 5 && <li>and {newlyBroken.length - 5} more</li>}
        </ul>
      }
    />
  )
}
