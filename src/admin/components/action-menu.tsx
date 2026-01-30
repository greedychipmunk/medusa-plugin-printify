import { DropdownMenu, IconButton, clx } from "@medusajs/ui"
import { EllipsisHorizontal } from "@medusajs/icons"

export type Action = {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}

export type ActionGroup = {
  actions: Action[]
}

export type ActionMenuProps = {
  groups: ActionGroup[]
}

export const ActionMenu = ({ groups }: ActionMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IconButton size="small" variant="transparent">
          <EllipsisHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {groups.map((group, index) => {
          if (!group.actions.length) {
            return null
          }

          const isLast = index === groups.length - 1

          return (
            <DropdownMenu.Group key={index}>
              {group.actions.map((action, actionIndex) => (
                <DropdownMenu.Item
                  disabled={action.disabled}
                  key={actionIndex}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    action.onClick()
                  }}
                  className={clx(
                    "[&_svg]:text-ui-fg-subtle flex items-center gap-x-2",
                    {
                      "[&_svg]:text-ui-fg-disabled": action.disabled,
                    }
                  )}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </DropdownMenu.Item>
              ))}
              {!isLast && <DropdownMenu.Separator />}
            </DropdownMenu.Group>
          )
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
