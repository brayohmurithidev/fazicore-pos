import random
import string
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem, OrderStatus, PaymentStatus
from app.repositories.inventory import InventoryRepository
from app.repositories.order import OrderRepository
from app.repositories.product import ProductRepository
from app.schemas.order import OrderCreate


def _generate_order_number(org_prefix: str, today: date, sequence: int) -> str:
    prefix = org_prefix.upper()[:4]
    date_str = today.strftime("%Y%m%d")
    return f"{prefix}-{date_str}-{sequence:05d}"


class OrderService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.order_repo = OrderRepository(session)
        self.product_repo = ProductRepository(session)
        self.inventory_repo = InventoryRepository(session)

    async def create_order(
        self,
        org_id: int,
        cashier_id: int,
        branch_id: int | None,
        org_slug: str,
        data: OrderCreate,
    ) -> Order:
        today = datetime.now(timezone.utc).date()
        count = await self.order_repo.count_today_for_org(org_id, today)
        order_number = _generate_order_number(org_slug, today, count + 1)

        subtotal = 0.0
        tax_amount = 0.0
        order_items = []

        for item_data in data.items:
            item_total = round(
                (item_data.unit_price * item_data.quantity) - item_data.discount_amount, 2
            )
            subtotal += item_total

            if item_data.product_id:
                product = await self.product_repo.get(item_data.product_id)
                if product and product.track_inventory:
                    inv = await self.inventory_repo.get_by_product_branch(
                        item_data.product_id, branch_id
                    )
                    if inv is None:
                        inv = await self.inventory_repo.get_by_product_branch(
                            item_data.product_id, None
                        )
                    if inv is not None:
                        if inv.available_quantity < item_data.quantity:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Insufficient stock for '{item_data.product_name}'",
                            )
                        from app.models.inventory import TransactionType
                        await self.inventory_repo.adjust(
                            inv,
                            -item_data.quantity,
                            TransactionType.SALE,
                            cashier_id,
                            f"Order {order_number}",
                        )

            order_items.append(
                OrderItem(
                    product_id=item_data.product_id,
                    product_name=item_data.product_name,
                    product_sku=item_data.product_sku,
                    quantity=item_data.quantity,
                    unit_price=item_data.unit_price,
                    discount_amount=item_data.discount_amount,
                    total=item_total,
                )
            )

        subtotal = round(subtotal, 2)
        discount_amount = round(data.discount_amount, 2)
        taxable = subtotal - discount_amount
        tax_amount = 0.0
        total = round(taxable, 2)
        amount_paid = round(data.amount_paid, 2)
        change_given = round(max(0.0, amount_paid - total), 2)

        order = Order(
            org_id=org_id,
            branch_id=branch_id if branch_id is not None else data.branch_id,
            order_number=order_number,
            customer_id=data.customer_id,
            cashier_id=cashier_id,
            status=OrderStatus.COMPLETED,
            payment_method=data.payment_method,
            payment_status=PaymentStatus.PAID,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total=total,
            amount_paid=amount_paid,
            change_given=change_given,
            mpesa_ref=data.mpesa_ref,
            mpesa_amount=data.mpesa_amount,
            cash_amount=data.cash_amount,
            credit_customer_name=data.credit_customer_name,
            credit_customer_phone=data.credit_customer_phone,
            notes=data.notes,
            items=order_items,
        )
        self.session.add(order)
        await self.session.flush()
        await self.session.refresh(order)
        return order
