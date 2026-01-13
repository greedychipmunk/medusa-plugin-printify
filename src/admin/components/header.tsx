import { Heading, Button, Text } from "@medusajs/ui"
import React from "react"
import { ActionMenu, ActionMenuProps } from "./action-menu"

export type HeaderProps = {
  title: string
  subtitle?: string
  actions?: (
    | {
        type: "button"
        props: React.ComponentProps<typeof Button>
      }
    | {
        type: "action-menu"
        props: ActionMenuProps
      }
    | {
        type: "custom"
        children: React.ReactNode
      }
  )[]
}

export const Header = ({ title, subtitle, actions = [] }: HeaderProps) => {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div>
        <Heading level="h2">{title}</Heading>
        {subtitle && (
          <Text className="text-ui-fg-subtle" size="small">
            {subtitle}
          </Text>
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex items-center justify-center gap-x-2">
          {actions.map((action, index) => (
            <React.Fragment key={index}>
              {action.type === "button" && (
                <Button {...action.props} size={action.props.size || "small"}>
                  {action.props.children}
                </Button>
              )}
              {action.type === "action-menu" && (
                <ActionMenu {...action.props} />
              )}
              {action.type === "custom" && action.children}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
