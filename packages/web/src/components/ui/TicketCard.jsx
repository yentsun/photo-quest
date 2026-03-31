/**
 * @file Ticket card — a ConsumableCard preset for memory game tickets.
 */

import ConsumableCard from './ConsumableCard.jsx';
import ticketIcon from '../../icons/ticket2-svgrepo-com.svg';

export default function TicketCard({ subtitle, className, onClick, children }) {
  return (
    <ConsumableCard
      label="Ticket"
      title="Memory Game"
      subtitle={subtitle}
      icon={<img src={ticketIcon} alt="Ticket" className="w-28 h-28 invert opacity-70" />}
      borderColor="border-purple-700/60"
      bgGradient="bg-gradient-to-br from-purple-900 to-blue-900"
      className={className}
      onClick={onClick}
    >
      {children}
    </ConsumableCard>
  );
}
