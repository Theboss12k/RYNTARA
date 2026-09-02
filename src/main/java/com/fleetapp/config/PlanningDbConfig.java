package com.fleetapp.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.HashMap;

@Configuration
@EnableJpaRepositories(
        basePackages = "com.fleetapp.planning.repository", // <-- Points to Planner Repos
        entityManagerFactoryRef = "planningEntityManagerFactory",
        transactionManagerRef = "planningTransactionManager"
)
public class PlanningDbConfig {

    @Bean(name = "planningDataSource")
    @ConfigurationProperties(prefix = "spring.datasource.planning")
    public DataSource planningDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean(name = "planningEntityManagerFactory")
    public LocalContainerEntityManagerFactoryBean planningEntityManagerFactory(
            @Qualifier("planningDataSource") DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan("com.fleetapp.planning.entity"); // <-- Points to Planner Entities
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());

        HashMap<String, Object> properties = new HashMap<>();
        properties.put("hibernate.hbm2ddl.auto", "update");
        properties.put("hibernate.show_sql", "false");

        // This line guarantees the geometry types are generated correctly in PostGIS
        properties.put("hibernate.dialect", "org.hibernate.spatial.dialect.postgis.PostgisPG95Dialect");
        em.setJpaPropertyMap(properties);

        return em;
    }

    @Bean(name = "planningTransactionManager")
    public PlatformTransactionManager planningTransactionManager(
            @Qualifier("planningEntityManagerFactory") LocalContainerEntityManagerFactoryBean factory) {
        return new JpaTransactionManager(factory.getObject());
    }
}