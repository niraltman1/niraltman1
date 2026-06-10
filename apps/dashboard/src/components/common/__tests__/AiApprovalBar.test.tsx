import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiApprovalBar } from '../AiApprovalBar.js';

describe('AiApprovalBar', () => {
  it('renders אשר and דחה buttons when state is pending', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('אשר')).toBeTruthy();
    expect(screen.getByText('דחה')).toBeTruthy();
  });

  it('renders עריכה button when onEdit is provided', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText('עריכה')).toBeTruthy();
  });

  it('does not render עריכה when onEdit is omitted', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByText('עריכה')).toBeNull();
  });

  it('calls onApprove when אשר is clicked', () => {
    const onApprove = vi.fn();
    render(<AiApprovalBar onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByText('אשר'));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('calls onReject when דחה is clicked', () => {
    const onReject = vi.fn();
    render(<AiApprovalBar onApprove={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByText('דחה'));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('shows ✓ אומת badge when state is approved', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} state="approved" />);
    expect(screen.getByText('✓ אומת')).toBeTruthy();
    expect(screen.queryByText('אשר')).toBeNull();
  });

  it('shows ✗ נדחה badge when state is rejected', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} state="rejected" />);
    expect(screen.getByText('✗ נדחה')).toBeTruthy();
    expect(screen.queryByText('דחה')).toBeNull();
  });

  it('disables buttons when isPending is true', () => {
    render(<AiApprovalBar onApprove={vi.fn()} onReject={vi.fn()} isPending />);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
