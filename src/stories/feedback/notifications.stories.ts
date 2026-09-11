import type { Meta, StoryObj } from '@storybook/angular-vite';
import { NotificationGalleryComponent } from './notification-gallery.component';

/**
 * What `NotificationService` says, in the real `app-notification-stack`.
 *
 * The kind is chosen by who acted, not by how bad it is: a **refusal** is the
 * app declining what the reader just asked for, a **warning** is a state the
 * drawing is now in, **news** is a consequence where nothing failed, and
 * **success** and **failure** are the rest. The stack is fixed to the top of
 * the window, so each story renders in its own frame.
 */
const meta: Meta<NotificationGalleryComponent> = {
  title: 'Feedback/Notifications',
  component: NotificationGalleryComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 120 } },
  },
  render: (args) => ({
    props: args,
    template: `<sb-notification-gallery [kinds]="kinds"></sb-notification-gallery>`,
  }),
};

export default meta;
type Story = StoryObj<NotificationGalleryComponent>;

export const Success: Story = { args: { kinds: ['success'] } };

export const Refusal: Story = { args: { kinds: ['refusal'] } };

export const Warning: Story = { args: { kinds: ['warning'] } };

export const News: Story = { args: { kinds: ['news'] } };

export const Failure: Story = { args: { kinds: ['failure'] } };

/** All five at once, which the service itself never shows: it keeps three at most. */
export const AllKinds: Story = {
  args: { kinds: ['success', 'refusal', 'warning', 'news', 'failure'] },
  parameters: { docs: { story: { inline: false, iframeHeight: 380 } } },
};
