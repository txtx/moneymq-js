import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckoutModal } from '../checkout-modal';

const meta = {
  title: 'Components/CheckoutModal',
  component: CheckoutModal,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    visible: {
      control: 'boolean',
    },
    amount: {
      control: 'number',
    },
    currency: {
      control: 'text',
    },
    debug: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof CheckoutModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    visible: true,
    amount: 9.99,
    currency: 'USDC',
    recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    onClose: () => console.log('Modal closed'),
  },
};

export const WithLineItems: Story = {
  args: {
    visible: true,
    amount: 24.97,
    currency: 'USDC',
    recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    lineItems: [
      {
        product: { id: 'prod_1', name: 'Pro Subscription' },
        price: { id: 'price_1', unit_amount: 999, currency: 'USDC' },
        quantity: 1,
      },
      {
        product: { id: 'prod_2', name: 'Extra Storage (10GB)' },
        price: { id: 'price_2', unit_amount: 499, currency: 'USDC' },
        quantity: 3,
      },
    ],
    onClose: () => console.log('Modal closed'),
  },
};

export const WithDebug: Story = {
  args: {
    visible: true,
    amount: 9.99,
    currency: 'USDC',
    recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    debug: true,
    onClose: () => console.log('Modal closed'),
  },
};

export const HighValue: Story = {
  args: {
    visible: true,
    amount: 999.00,
    currency: 'USDC',
    recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    lineItems: [
      {
        product: { id: 'prod_enterprise', name: 'Enterprise Annual License' },
        price: { id: 'price_enterprise', unit_amount: 99900, currency: 'USDC' },
        quantity: 1,
      },
    ],
    debug: true,
    onClose: () => console.log('Modal closed'),
  },
};

export const Hidden: Story = {
  args: {
    visible: false,
    amount: 9.99,
    currency: 'USDC',
    recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    onClose: () => console.log('Modal closed'),
  },
};
