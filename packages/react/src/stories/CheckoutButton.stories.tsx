import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckoutButton } from '../checkout-button';

const meta = {
  title: 'Components/CheckoutButton',
  component: CheckoutButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline'],
    },
    debug: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof CheckoutButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleProduct = {
  id: 'prod_123',
  name: 'Pro Subscription',
  description: 'Monthly subscription to Pro features',
};

const samplePrice = {
  id: 'price_123',
  unit_amount: 999, // $9.99
  currency: 'USDC',
  product: 'prod_123',
};

export const Default: Story = {
  args: {
    basket: [{ product: sampleProduct, price: samplePrice }],
  },
};

export const WithDebug: Story = {
  args: {
    basket: [{ product: sampleProduct, price: samplePrice }],
    debug: true,
  },
};

export const Outline: Story = {
  args: {
    basket: [{ product: sampleProduct, price: samplePrice }],
    variant: 'outline',
  },
};

export const Disabled: Story = {
  args: {
    basket: [{ product: sampleProduct, price: samplePrice }],
    disabled: true,
  },
};

export const MultipleItems: Story = {
  args: {
    basket: [
      {
        product: { id: 'prod_1', name: 'Basic Plan' },
        price: { id: 'price_1', unit_amount: 999, currency: 'USDC' },
      },
      {
        product: { id: 'prod_2', name: 'Add-on Feature' },
        price: { id: 'price_2', unit_amount: 499, currency: 'USDC' },
        quantity: 2,
      },
    ],
    debug: true,
  },
};

export const CustomChildren: Story = {
  args: {
    basket: [{ product: sampleProduct, price: samplePrice }],
    children: 'Subscribe Now - $9.99/mo',
  },
};

export const HighValue: Story = {
  args: {
    basket: [
      {
        product: { id: 'prod_enterprise', name: 'Enterprise License' },
        price: { id: 'price_enterprise', unit_amount: 99900, currency: 'USDC' },
      },
    ],
    debug: true,
  },
};
