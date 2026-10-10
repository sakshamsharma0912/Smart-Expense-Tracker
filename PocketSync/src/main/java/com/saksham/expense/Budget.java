package com.saksham.expense;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;
@Entity @Table(name="expense_budgets",uniqueConstraints=@UniqueConstraint(columnNames={"user_id","report_month","category"}))
public class Budget {
    @Id @Column(length=80) String id = UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") User user;
    @Column(name="report_month",nullable=false,length=7) String month;
    @Column(nullable=false,length=24) String category;
    @Column(nullable=false,precision=11,scale=2) BigDecimal amount;
    protected Budget() {}
}
